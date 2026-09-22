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

const SOCIAL_FIELDS = ["tiktok", "instagram", "facebook", "youtube", "amazon"] as const;

function normalizeSocialUrl(value: string | null | undefined): string {
  if (!value) return "";
  let v = value.trim().toLowerCase();
  if (!v) return "";
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    u.pathname = u.pathname.replace(/\/$/, "");
    return `${u.hostname}${u.pathname}`;
  } catch {
    return v.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  }
}

function importIdentity(r: CreatorImportRow): string {
  const code = (r.code ?? "").trim().toLowerCase();
  if (code) return `code-${code}`;
  const domain = (r.normalized_domain ?? "").trim().toLowerCase();
  if (domain) return `domain-${domain}`;
  for (const field of SOCIAL_FIELDS) {
    const social = normalizeSocialUrl(r[field]);
    if (social) return `${field}-${social}`;
  }
  return "";
}

export const importCreators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: CreatorImportRow[] }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows required");
    return data;
  })
  .handler(async ({ data, context }) => {
    // Universal staging import: a row may be identified by code/domain OR a social profile.
    // Existing records are never overwritten by this import.
    const incoming = data.rows.filter((r) => importIdentity(r));
    if (incoming.length === 0) return { inserted: 0, skipped: 0, total: 0 };

    const { data: existingRows, error: existingError } = await context.supabase
      .from("creators")
      .select("id, code, normalized_domain, tiktok, instagram, facebook, youtube, amazon");
    if (existingError) throw new Error(existingError.message);

    const existing = new Set<string>();
    for (const row of (existingRows ?? []) as Array<Record<string, Json>>) {
      const code = String(row.code ?? "").trim().toLowerCase();
      const domain = String(row.normalized_domain ?? "").trim().toLowerCase();
      if (code) existing.add(`code-${code}`);
      if (domain) existing.add(`domain-${domain}`);
      for (const field of SOCIAL_FIELDS) {
        const social = normalizeSocialUrl(row[field] as string | null);
        if (social) existing.add(`${field}-${social}`);
      }
    }

    let skipped = 0;
    const toInsert: Array<Record<string, Json>> = [];
    const seen = new Set<string>();

    for (const r of incoming) {
      const identity = importIdentity(r);
      if (!identity || existing.has(identity) || seen.has(identity)) {
        skipped++;
        continue;
      }
      seen.add(identity);

      // Also reject a row when any supplied social profile already exists.
      const socialKeys = SOCIAL_FIELDS
        .map((field) => {
          const social = normalizeSocialUrl(r[field]);
          return social ? `${field}-${social}` : "";
        })
        .filter(Boolean);
      if (socialKeys.some((key) => existing.has(key) || seen.has(key) && key !== identity)) {
        skipped++;
        continue;
      }
      socialKeys.forEach((key) => seen.add(key));

      const safeIdentity = identity.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64);
      const id = `IMP-${safeIdentity}`;
      toInsert.push({
        id,
        code: r.code,
        name: r.name || identity || "Unnamed",
        segment: r.segment,
        primary_platforms: r.primary_platforms,
        email: r.email,
        facebook: r.facebook,
        instagram: r.instagram,
        tiktok: r.tiktok,
        youtube: r.youtube,
        priority: r.priority,
        amazon: r.amazon,
        research_notes: r.research_notes,
        outreach_owner: r.outreach_owner,
        normalized_domain: (r.normalized_domain ?? "").trim() || null,
        imported_by: context.userId,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await context.supabase
        .from("creators")
        .upsert(toInsert as never, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    return { inserted: toInsert.length, skipped, total: incoming.length };
  });

export type ResearchCreatorInput = {
  name: string;
  code?: string | null;
  normalized_domain?: string | null;
  segment?: string | null;
  primary_platforms?: string | null;
  email?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  priority?: string | null;
  amazon?: string | null;
  research_notes?: string | null;
  recommended_offer?: string | null;
  outreach_owner?: string | null;
  last_researched?: string | null;
};

export const upsertCreatorFromResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { row: ResearchCreatorInput }) => {
    if (!data?.row) throw new Error("row required");
    if (!data.row.name || !data.row.name.trim()) throw new Error("name required");
    if (!data.row.code && !data.row.normalized_domain) {
      throw new Error("code or normalized_domain required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const r = data.row;
    const codeLower = (r.code ?? "").trim().toLowerCase();
    const dom = (r.normalized_domain ?? "").trim();

    const orFilters: string[] = [];
    if (codeLower) orFilters.push(`code.eq.${codeLower}`);
    if (dom) orFilters.push(`normalized_domain.eq.${dom}`);
    if (orFilters.length > 0) {
      const { data: existing, error } = await context.supabase
        .from("creators")
        .select("id")
        .or(orFilters.join(","))
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (existing) return { id: existing.id as string, created: false };
    }

    const id = codeLower
      ? `RES-${codeLower.toUpperCase().replace(/[^A-Z0-9]/g, "")}`
      : `RES-${dom.replace(/[^a-z0-9]/g, "").toUpperCase()}`;
    const insertRow: Record<string, Json> = {
      id,
      code: r.code ?? null,
      name: r.name,
      segment: r.segment ?? null,
      primary_platforms: r.primary_platforms ?? null,
      email: r.email ?? null,
      facebook: r.facebook ?? null,
      instagram: r.instagram ?? null,
      tiktok: r.tiktok ?? null,
      youtube: r.youtube ?? null,
      priority: r.priority ?? null,
      amazon: r.amazon ?? null,
      research_notes: r.research_notes ?? null,
      recommended_offer: r.recommended_offer ?? null,
      outreach_owner: r.outreach_owner ?? null,
      last_researched: r.last_researched ?? new Date().toISOString().slice(0, 10),
      normalized_domain: dom || null,
      imported_by: context.userId,
    };
    const { error: insErr } = await context.supabase
      .from("creators")
      .upsert(insertRow as never, { onConflict: "id", ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);
    return { id, created: true };
  });

// KISS workflow updater used by the one-page creator pipeline.
export const updateCreatorWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    contacted_date?: string | null;
    contact_method?: string | null;
    response_followup?: string | null;
    sample_status?: string | null;
    rena_notes?: string | null;
  }) => {
    if (!data?.id) throw new Error("Creator id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const { error } = await context.supabase
      .from("creators")
      .update(cleanPatch as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { updated: true };
  });
