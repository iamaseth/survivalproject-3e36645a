// Creators roster — team-wide table replacing the hardcoded CREATORS array.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
export type CreatorDBRow = { id: string; name: string; [k: string]: Json };

export const listCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("creators")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Array<Record<string, Json>> };
  });

// DISABLED: the legacy hard-coded roster (ST-INF-001–250) must never be
// re-inserted into the live creators table. This function is retained as a
// no-op so any stale caller cannot repopulate archived records.
export const seedCreatorsFromStatic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: CreatorDBRow[] }) => data ?? { rows: [] })
  .handler(async () => {
    return { inserted: 0, existing: 0, disabled: true as const };
  });

export type CreatorImportRow = {
  code: string | null;
  normalized_domain: string | null;
  name: string;
  segment: string | null;
  primary_platforms: string | null;
  email: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  priority: string | null;
  amazon: string | null;
  research_notes: string | null;
  outreach_owner: string | null;
};

export const importCreators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: CreatorImportRow[] }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const incoming = data.rows.filter((r) => importKeys(r).length > 0);
    if (incoming.length === 0) return { inserted: 0, skipped: data.rows.length, total: data.rows.length };

    const existing = new Set<string>();
    for (const row of (existingRows ?? []) as Array<Record<string, Json>>) {
      const keys = importKeys(row as CreatorImportRow);
      keys.forEach((key) => existing.add(key));
    }

    let skipped = data.rows.length - incoming.length;
    const toInsert: Array<Record<string, Json>> = [];
    const seen = new Set<string>();

    for (const r of incoming) {
      const keys = importKeys(r);
      if (keys.some((key) => existing.has(key) || seen.has(key))) {
        skipped++;
        continue;
      }
      // Reserve identities only after all checks pass.
      keys.forEach((key) => seen.add(key));
      const stableKey = keys.find((key) => key.startsWith("tiktok:")) ?? keys[0];
      const id = `IMP-${stableKey.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64)}`;

