import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCreatorProfile } from "@/lib/creators.functions";

export type TikTokEnrichmentRow = {
  tiktok: string;
  source_url?: string | null;
  search_term?: string | null;
  evidence?: string | null;
  reach_signal?: string | null;
  monetization?: string | null;
  segment?: string | null;
  website?: string | null;
};

const clean = (v: string | null | undefined, max = 1500) => (v ?? "").trim().slice(0, max);
const keyOf = (url: string | null | undefined) => normalizeCreatorProfile(url, "tiktok");
const FIELDS = ["reach_signal", "monetization", "segment"] as const;

// Exact TikTok identity only. Never guess a cross-platform identity or merge duplicate records.
// Preview and apply use the same matching and validation path; no new creators are inserted.
export const importTikTokEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: TikTokEnrichmentRow[]; dryRun: boolean }) => {
    if (!data || !Array.isArray(data.rows) || typeof data.dryRun !== "boolean") throw new Error("rows and dryRun required");
    if (data.rows.length > 1000) throw new Error("Maximum 1000 rows per batch");
    return data;
  })
  .handler(async ({ data, context }) => {
    const index = new Map<string, Array<Record<string, string | null>>>();
    // Supabase defaults to 1000 rows: fetch all pages so existing records are not missed.
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await context.supabase.from("creators")
        .select("id,tiktok,research_notes,reach_signal,monetization,segment")
        .not("tiktok", "is", null).range(offset, offset + 499);
      if (error) throw new Error(error.message);
      for (const record of page ?? []) {
        const row = record as Record<string, string | null>;
        const key = keyOf(row.tiktok);
        if (key) index.set(key, [...(index.get(key) ?? []), row]);
      }
      if ((page ?? []).length < 500) break;
    }

    const seen = new Set<string>();
    const summary = { total: data.rows.length, matched: 0, updated: 0, unchanged: 0, missing: 0, duplicates: 0, invalid: 0, repeated: 0, conflicts: 0, dryRun: data.dryRun };
    const review: Array<{ tiktok: string; reason: string }> = [];
    for (const input of data.rows) {
      const key = keyOf(input.tiktok);
      if (!key) { summary.invalid++; review.push({ tiktok: clean(input.tiktok, 100), reason: "Invalid TikTok profile" }); continue; }
      if (seen.has(key)) { summary.repeated++; continue; }
      seen.add(key);
      const matches = index.get(key) ?? [];
      if (!matches.length) { summary.missing++; review.push({ tiktok: input.tiktok, reason: "No existing creator; enrichment does not insert" }); continue; }
      if (matches.length !== 1) { summary.duplicates++; review.push({ tiktok: input.tiktok, reason: `${matches.length} CRM records share this TikTok profile; manual review required` }); continue; }
      summary.matched++;
      const existing = matches[0];
      const patch: Record<string, string> = {};
      for (const field of FIELDS) {
        const incoming = clean(input[field], 500);
        if (!incoming) continue;
        if (!clean(existing[field])) patch[field] = incoming;
        else if (clean(existing[field]) !== incoming) summary.conflicts++;
      }
      const evidence = clean(input.evidence, 800);
      const source = clean(input.source_url, 300);
      const search = clean(input.search_term, 120);
      // Do not store a source-free assertion, or repeat evidence already stored.
      if (evidence && source && /^https?:\/\//i.test(source)) {
        const note = `TikTok clipping [${search || "search"}] ${source}: ${evidence}`;
        const prior = clean(existing.research_notes, 100000);
        if (!prior.includes(note)) patch.research_notes = [prior, note].filter(Boolean).join("\n").slice(0, 20000);
      }
      if (!Object.keys(patch).length) { summary.unchanged++; continue; }
      if (!data.dryRun) {
        // Only write to the uniquely matched id; preserve all other creator and outreach fields.
        const { error } = await context.supabase.from("creators").update(patch as never).eq("id", existing.id);
        if (error) throw new Error(`Enrichment failed for ${key}: ${error.message}`);
      }
      summary.updated++;
    }
    return { ...summary, review: review.slice(0, 100) };
  });
