import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CandidateType = "video" | "storefront" | "profile";
type DiscoveryCandidate = { url: string; type: CandidateType };

const AMAZON_HOSTS = new Set(["amazon.com", "www.amazon.com"]);

function normalizeAmazonUrl(raw: string): string | null {
  try {
    const cleaned = raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/^\"|\"$/g, "");
    const url = cleaned.startsWith("http") ? new URL(cleaned) : new URL(cleaned, "https://www.amazon.com");
    if (!AMAZON_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (["tag", "ref", "ref_", "linkCode", "psc", "dib", "keywords", "qid", "sprefix"].includes(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch { return null; }
}

function classify(url: string): CandidateType | null {
  try {
    const p = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
    if (/^\/live\/video\/[a-z0-9_-]+$/i.test(p)) return "video";
    if (/^\/shop\/[^/]+/i.test(p)) return "storefront";
    if (/^\/(?:influencer|creator|profile)\/[^/]+/i.test(p)) return "profile";
    return null;
  } catch { return null; }
}

function extractAmazonCandidates(html: string, seedUrl: string): DiscoveryCandidate[] {
  const seen = new Set<string>();
  const out: DiscoveryCandidate[] = [];
  const seed = normalizeAmazonUrl(seedUrl);
  const patterns = [
    /https?:\\?\/\\?\/(?:www\\.)?amazon\\.com[^\"'<>\\s]+/gi,
    /href=[\"']([^\"']+)[\"']/gi,
    /\"url\"\s*:\s*\"([^\"]+)\"/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const normalized = normalizeAmazonUrl(match[1] ?? match[0]);
      if (!normalized || normalized === seed || seen.has(normalized)) continue;
      const type = classify(normalized);
      if (!type) continue;
      seen.add(normalized);
      out.push({ url: normalized, type });
    }
  }
  return out.slice(0, 100);
}

function derivedId(url: string) {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) { hash ^= url.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `AMZ-DISC-${Math.abs(hash >>> 0).toString(36).toUpperCase()}`;
}

export const runAmazonDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { seedUrl: string }) => {
    if (!data?.seedUrl?.trim()) throw new Error("Amazon seed URL is required.");
    const normalized = normalizeAmazonUrl(data.seedUrl.trim());
    if (!normalized) throw new Error("Use an amazon.com video or storefront URL.");
    return { seedUrl: normalized };
  })
  .handler(async ({ data, context }) => {
    const response = await fetch(data.seedUrl, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { fetched: false, status: response.status, found: 0, inserted: 0, blocked: response.status === 429 || response.status === 503, message: `Amazon returned HTTP ${response.status}. Use the Crawlee fallback when direct discovery is blocked.` };
    const candidates = extractAmazonCandidates(await response.text(), data.seedUrl);
    if (candidates.length === 0) return { fetched: true, status: response.status, found: 0, inserted: 0, blocked: false, message: "Amazon loaded, but no actual creator/video links were available in the page HTML. Generic Amazon navigation links are intentionally ignored." };
    const rows = candidates.map((candidate) => ({ seed_url: data.seedUrl, candidate_url: candidate.url, candidate_type: candidate.type, source_label: "Amazon Explore related content", status: "new", discovered_by: context.userId }));
    const { data: inserted, error } = await context.supabase.from("amazon_discovery_candidates").upsert(rows as never, { onConflict: "seed_url,candidate_url", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    return { fetched: true, status: response.status, found: candidates.length, inserted: inserted?.length ?? 0, blocked: false, message: `Found ${candidates.length} Amazon creator/video candidates.` };
  });

export const listAmazonDiscoveryCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("amazon_discovery_candidates").select("*").order("discovered_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Old versions accidentally stored Amazon navigation pages such as /live/info and /live/channel.
    // Filter them at read time so the user only sees real creator storefronts/profiles/videos.
    const rows = (data ?? []).filter((row: any) => typeof row.candidate_url === "string" && classify(row.candidate_url));
    return { rows };
  });

export const setAmazonDiscoveryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "new" | "review" | "promoted" | "skipped" }) => { if (!data?.id) throw new Error("Candidate id required."); return data; })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("amazon_discovery_candidates").update({ status: data.status, reviewed_at: data.status === "new" ? null : new Date().toISOString() } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { updated: true };
  });

export const promoteAmazonDiscoveryCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => { if (!data?.id) throw new Error("Candidate id required."); return data; })
  .handler(async ({ data, context }) => {
    const { data: candidate, error: candidateError } = await context.supabase.from("amazon_discovery_candidates").select("*").eq("id", data.id).single();
    if (candidateError) throw new Error(candidateError.message);

    const url = candidate.candidate_url as string;
    const type = classify(url);
    if (!type) throw new Error("This is an Amazon navigation page, not a creator. It cannot be added.");
    const videoUrl = type === "video" ? url : null;
    const storefrontUrl = type === "storefront" || type === "profile" ? url : null;

    const filters: string[] = [];
    if (videoUrl) filters.push(`amazon_video_url.eq.${videoUrl}`);
    if (storefrontUrl) filters.push(`amazon_storefront_url.eq.${storefrontUrl}`);
    let creatorId: string | null = null;
    if (filters.length) {
      const { data: existing, error } = await context.supabase.from("creators").select("id").or(filters.join(",")).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      creatorId = (existing?.id as string | undefined) ?? null;
    }

    if (!creatorId) {
      creatorId = derivedId(url);
      const row = {
        id: creatorId,
        name: (candidate.creator_name as string | null) || "Amazon creator — name to verify",
        primary_source: "Amazon",
        primary_platforms: "Amazon",
        amazon: "Yes",
        amazon_video_url: videoUrl,
        amazon_storefront_url: storefrontUrl,
        amazon_discovery_source: (candidate.source_label as string | null) || "Amazon Explore related content",
        amazon_shoppable_video: true,
        amazon_reviewed_survival_tabs: false,
        research_status: "Amazon discovery — verify creator",
        research_notes: "Automatically discovered from Amazon related content. Verify creator identity, audience and public contact route before outreach.",
        imported_by: context.userId,
        last_researched: new Date().toISOString().slice(0, 10),
      };
      const { error } = await context.supabase.from("creators").insert(row as never);
      if (error) throw new Error(error.message);
    }

    const { error: updateError } = await context.supabase.from("amazon_discovery_candidates").update({ status: "promoted", promoted_creator_id: creatorId, reviewed_at: new Date().toISOString() } as never).eq("id", data.id);
    if (updateError) throw new Error(updateError.message);
    return { creatorId };
  });
