import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCreatorProfile } from "@/lib/creators.functions";
import type { TikTokEnrichmentRow } from "@/lib/tiktok-enrichment.functions";

export type OnePassTikTokRow = TikTokEnrichmentRow & { name?: string | null };
const clean = (value: string | null | undefined, max = 500) => (value ?? "").trim().slice(0, max);
const identity = (value: string | null | undefined) => normalizeCreatorProfile(value, "tiktok");
const FIELDS = ["reach_signal", "monetization", "segment"] as const;
const noteFor = (row: OnePassTikTokRow) => {
  const source = clean(row.source_url, 400);
  const evidence = clean(row.evidence, 800);
  if (!source || !evidence) return "";
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || !["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(url.hostname.toLowerCase())) return "";
    return `TikTok clipping [${clean(row.search_term, 120) || "search"}] ${url.toString()}: ${evidence}`;
  } catch { return ""; }
};

// One CSV, one preview/apply: create missing TikTok identities and fill empty fields
// on uniquely matched creators. Ambiguous identities and other platforms are never merged.
export const importOnePassTikTok = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: OnePassTikTokRow[]; dryRun: boolean }) => {
    if (!data || !Array.isArray(data.rows) || typeof data.dryRun !== "boolean" || data.rows.length > 1000)
      throw new Error("Expected 0–1000 rows and dryRun");
    return data;
  })
  .handler(async ({ data, context }) => {
    const index = new Map<string, Array<Record<string, string | null>>>();
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await context.supabase.from("creators")
        .select("id,tiktok,research_notes,reach_signal,monetization,segment")
        .not("tiktok", "is", null).order("id", { ascending: true }).range(offset, offset + 499);
      if (error) throw new Error(error.message);
      for (const record of page ?? []) {
        const item = record as Record<string, string | null>;
        const key = identity(item.tiktok);
        if (key) index.set(key, [...(index.get(key) ?? []), item]);
      }
      if ((page ?? []).length < 500) break;
    }
    const summary = { total: data.rows.length, created: 0, enriched: 0, unchanged: 0, duplicates: 0, invalid: 0, repeated: 0, conflicts: 0, dryRun: data.dryRun };
    const review: Array<{ tiktok: string; reason: string }> = [];
    const seen = new Set<string>();
    for (const input of data.rows) {
      const key = identity(input.tiktok);
      if (!key) { summary.invalid++; review.push({ tiktok: clean(input.tiktok), reason: "Invalid TikTok profile" }); continue; }
      if (seen.has(key)) { summary.repeated++; continue; }
      seen.add(key);
      const matches = index.get(key) ?? [];
      if (matches.length > 1) { summary.duplicates++; review.push({ tiktok: input.tiktok, reason: "Multiple CRM identities; manual review required" }); continue; }
      const note = noteFor(input);
      // Reject unsupported assertions: enrichment fields must be accompanied by attributed evidence.
      const verified = !!note;
      if (!matches.length) {
        const handle = key.slice("tiktok:@".length);
        const profile = `https://www.tiktok.com/@${handle}`;
        const id = `IMP-TIKTOK${handle.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
        const newRow: Record<string, string | null> = {
          id, code: null, name: clean(input.name, 150) || `@${handle}`,
          tiktok: profile, primary_platforms: "TikTok", research_notes: note || null,
          reach_signal: verified ? clean(input.reach_signal) || null : null,
          monetization: verified ? clean(input.monetization) || null : null,
          segment: verified ? clean(input.segment) || null : null,
        };
        if (!data.dryRun) {
          const { error } = await context.supabase.from("creators").insert(newRow as never);
          if (error) throw new Error(`Could not create ${key}: ${error.message}`);
        }
        summary.created++;
        index.set(key, [newRow]);
        continue;
      }
      const existing = matches[0];
      const patch: Record<string, string> = {};
      if (verified) for (const field of FIELDS) {
        const incoming = clean(input[field]);
        if (!incoming) continue;
        if (!clean(existing[field])) patch[field] = incoming;
        else if (clean(existing[field]) !== incoming) summary.conflicts++;
      }
      const prior = existing.research_notes ?? "";
      if (note && !prior.includes(note) && prior.length + note.length + 1 <= 20000)
        patch.research_notes = [prior, note].filter(Boolean).join("\n");
      if (!Object.keys(patch).length) { summary.unchanged++; continue; }
      if (!data.dryRun) {
        const { error } = await context.supabase.from("creators").update(patch as never).eq("id", existing.id);
        if (error) throw new Error(`Could not enrich ${key}: ${error.message}`);
      }
      summary.enriched++;
    }
    return { ...summary, review: review.slice(0, 100) };
  });
