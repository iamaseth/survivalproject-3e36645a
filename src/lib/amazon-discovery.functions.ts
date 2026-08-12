import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CandidateType = "video" | "storefront" | "profile" | "related_content";

type DiscoveryCandidate = {
  url: string;
  type: CandidateType;
};

const AMAZON_HOSTS = new Set(["amazon.com", "www.amazon.com"]);

function normalizeAmazonUrl(raw: string): string | null {
  try {
    const cleaned = raw
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/^\"|\"$/g, "");
    const url = cleaned.startsWith("http") ? new URL(cleaned) : new URL(cleaned, "https://www.amazon.com");
    if (!AMAZON_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (["tag", "ref", "ref_", "linkCode", "psc", "dib", "keywords", "qid", "sprefix"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function classify(url: string): CandidateType | null {
  const p = new URL(url).pathname.toLowerCase();
  if (p.includes("/live/video/")) return "video";
  if (p.startsWith("/shop/") || p.includes("/shop/")) return "storefront";
  if (p.includes("/influencer/") || p.includes("/creator/") || p.includes("/profile/")) return "profile";
  if (p.includes("/live/") || p.includes("/videos/")) return "related_content";
  return null;
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
      const raw = match[1] ?? match[0];
      const normalized = normalizeAmazonUrl(raw);
      if (!normalized || normalized === seed || seen.has(normalized)) continue;
      const type = classify(normalized);
      if (!type) continue;
      seen.add(normalized);
      out.push({ url: normalized, type });
    }
  }

  return out.slice(0, 100);
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

    if (!response.ok) {
      return {
        fetched: false,
        status: response.status,
        found: 0,
        inserted: 0,
        blocked: response.status === 429 || response.status === 503,
        message: `Amazon returned HTTP ${response.status}. Use the Crawlee fallback when direct discovery is blocked.`,
      };
    }

    const html = await response.text();
    const candidates = extractAmazonCandidates(html, data.seedUrl);
    if (candidates.length === 0) {
      return {
        fetched: true,
        status: response.status,
        found: 0,
        inserted: 0,
        blocked: false,
        message: "The page loaded, but related creator/video links were not present in server-rendered HTML. Use the Crawlee browser fallback for this seed.",
      };
    }

    const rows = candidates.map((candidate) => ({
      seed_url: data.seedUrl,
      candidate_url: candidate.url,
      candidate_type: candidate.type,
      source_label: "Amazon Explore related content",
      status: "new",
      discovered_by: context.userId,
    }));

    const { data: inserted, error } = await context.supabase
      .from("amazon_discovery_candidates")
      .upsert(rows as never, { onConflict: "seed_url,candidate_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    return {
      fetched: true,
      status: response.status,
      found: candidates.length,
      inserted: inserted?.length ?? 0,
      blocked: false,
      message: `Found ${candidates.length} Amazon creator/video candidates.`,
    };
  });

export const listAmazonDiscoveryCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("amazon_discovery_candidates")
      .select("*")
      .order("discovered_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const setAmazonDiscoveryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "new" | "review" | "promoted" | "skipped" }) => {
    if (!data?.id) throw new Error("Candidate id required.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const patch = {
      status: data.status,
      reviewed_at: data.status === "new" ? null : new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("amazon_discovery_candidates")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { updated: true };
  });
