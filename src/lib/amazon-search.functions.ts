import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const findAmazonCreators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { keywords?: string[]; includeSeed?: boolean; seedUrl?: string }) => data ?? {})
  .handler(async ({ data, context }) => {
    const {
      DEFAULT_KEYWORDS,
      REFERENCE_SEED_URL,
      extractAmazonCandidates,
      fetchAmazonHtml,
      searchUrlsForKeyword,
      normalizeAmazonUrl,
    } = await import("./amazon-search.server");

    const keywords = (data.keywords?.length ? data.keywords : DEFAULT_KEYWORDS)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 12);

    const seedUrl = normalizeAmazonUrl(data.seedUrl?.trim() || REFERENCE_SEED_URL) ?? REFERENCE_SEED_URL;

    const targets: Array<{ url: string; label: string }> = [];
    if (data.includeSeed !== false) targets.push({ url: seedUrl, label: "Survival Tabs review — related content" });
    for (const keyword of keywords) {
      for (const url of searchUrlsForKeyword(keyword)) targets.push({ url, label: `Search: ${keyword}` });
    }

    const found = new Map<string, { url: string; type: string; label: string }>();
    let blocked = 0;
    for (const target of targets) {
      const res = await fetchAmazonHtml(target.url);
      if (!res.ok) { blocked += 1; continue; }
      for (const candidate of extractAmazonCandidates(res.html, target.url)) {
        if (!found.has(candidate.url)) found.set(candidate.url, { url: candidate.url, type: candidate.type, label: target.label });
      }
    }

    if (found.size === 0) {
      return {
        found: 0,
        added: 0,
        blocked: blocked > 0,
        message: blocked > 0
          ? "Amazon limited these automated requests, so nothing new came back this time. Try again shortly or add a creator manually."
          : "No new creators came back from those searches.",
      };
    }

    // Skip anything already in the CRM (Amazon creators or main creator roster).
    const urls = [...found.keys()];
    const { data: existingCreators } = await context.supabase
      .from("creators")
      .select("amazon_video_url,amazon_storefront_url");
    const known = new Set<string>();
    for (const row of existingCreators ?? []) {
      const r = row as { amazon_video_url?: string | null; amazon_storefront_url?: string | null };
      if (r.amazon_video_url) known.add(r.amazon_video_url);
      if (r.amazon_storefront_url) known.add(r.amazon_storefront_url);
    }

    const rows = urls
      .filter((url) => !known.has(url))
      .map((url) => {
        const c = found.get(url)!;
        return {
          seed_url: seedUrl,
          candidate_url: c.url,
          candidate_type: c.type,
          source_label: c.label,
          status: "new",
          discovered_by: context.userId,
        };
      });

    if (rows.length === 0) {
      return { found: found.size, added: 0, blocked: false, message: "Everything found is already in your creator list." };
    }

    const { data: inserted, error } = await context.supabase
      .from("amazon_discovery_candidates")
      .upsert(rows as never, { onConflict: "seed_url,candidate_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    const added = inserted?.length ?? 0;
    return {
      found: found.size,
      added,
      blocked: false,
      message: added > 0 ? `${added} new creator${added === 1 ? "" : "s"} found.` : "Everything found is already in your list.",
    };
  });
