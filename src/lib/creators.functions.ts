// Creators roster — team-wide table replacing the hardcoded CREATORS array.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
export type CreatorDBRow = { id: string; name: string; [k: string]: Json };

export const listCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Supabase/PostgREST returns at most 1,000 rows per request by default.
    // Page explicitly so the CRM always hydrates the complete creators table.
    const rows: Array<Record<string, Json>> = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await context.supabase
        .from("creators")
        .select("*")
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Array<Record<string, Json>>;
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return { rows };
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
type SocialField = typeof SOCIAL_FIELDS[number];

export function normalizeCreatorProfile(value: string | null | undefined, field: SocialField): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
    const domains: Record<SocialField, string[]> = {
      tiktok: ["tiktok.com"], instagram: ["instagram.com"], facebook: ["facebook.com", "fb.com"],
      youtube: ["youtube.com", "youtu.be"], amazon: ["amazon.com"],
    };
    if (!domains[field].some((domain) => host === domain || host.endsWith(`.${domain}`))) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return "";
    if (field === "tiktok") {
      const handle = parts[0].startsWith("@") ? parts[0].slice(1) : "";
      return /^[a-z0-9._]{2,30}$/i.test(handle) ? `tiktok:@${handle.toLowerCase()}` : "";
    }
    if (field === "instagram" || field === "facebook") {
      const handle = parts[0].replace(/^@/, "").toLowerCase();
      if (["search", "reel", "reels", "watch", "explore", "p", "groups", "marketplace"].includes(handle)) return "";
      return `${field}:${handle}`;
    }
    if (field === "youtube") {
      if (parts[0].startsWith("@")) return `youtube:${parts[0].toLowerCase()}`;
      if (["channel", "c", "user"].includes(parts[0].toLowerCase()) && parts[1])
        return `youtube:${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
      return "";
    }
    return parts[0].toLowerCase() === "shop" && parts[1] ? `amazon:shop/${parts[1].toLowerCase()}` : "";
  } catch { return ""; }
}

export function creatorImportKeys(r: CreatorImportRow): string[] {
  const keys: string[] = [];
  const code = (r.code ?? "").trim().toLowerCase();
  const domain = (r.normalized_domain ?? "").trim().toLowerCase();
  if (code) keys.push(`code:${code}`);
  if (domain) keys.push(`domain:${domain}`);
  for (const field of SOCIAL_FIELDS) {
    const social = normalizeCreatorProfile(r[field], field);
    if (social) keys.push(social);
  }
  return keys;
}

export const importCreators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: CreatorImportRow[] }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: existingRows, error: existingError } = await context.supabase
      .from("creators")
      .select("id, code, normalized_domain, tiktok, instagram, facebook, youtube, amazon");
    if (existingError) throw new Error(existingError.message);

    const existing = new Set<string>();
    for (const row of existingRows ?? []) {
      creatorImportKeys(row as unknown as CreatorImportRow).forEach((key) => existing.add(key));
    }

    let skipped = 0;
    const seen = new Set<string>();
    const toInsert: Array<Record<string, Json>> = [];
    for (const r of data.rows) {
      // Reject malformed social URLs even if a supplied code would otherwise allow insertion.
      if (SOCIAL_FIELDS.some((field) => r[field]?.trim() && !normalizeCreatorProfile(r[field], field))) {
        skipped++;
        continue;
      }
      const keys = creatorImportKeys(r);
      if (!keys.length || keys.some((key) => existing.has(key) || seen.has(key))) {
        skipped++;
        continue;
      }
      // Reserve only after the entire row passes duplicate checks.
      keys.forEach((key) => seen.add(key));
      const identity = keys.find((key) => key.startsWith("tiktok:")) ?? keys[0];
      const id = `IMP-${identity.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64)}`;
      toInsert.push({
        id, code: r.code, name: r.name || identity, segment: r.segment,
        primary_platforms: r.primary_platforms, email: r.email,
        facebook: r.facebook, instagram: r.instagram, tiktok: r.tiktok,
        youtube: r.youtube, priority: r.priority, amazon: r.amazon,
        research_notes: r.research_notes, outreach_owner: r.outreach_owner,
        normalized_domain: r.normalized_domain, imported_by: context.userId,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await context.supabase.from("creators")
        .upsert(toInsert as never, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    return { inserted: toInsert.length, skipped, total: data.rows.length };
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
    const { data: changed, error } = await context.supabase
      .from("creators")
      .update(cleanPatch as never)
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!changed?.length) throw new Error("Creator status was not saved (record missing or update not permitted).");
    return { updated: true };
  });


// Import only saved personalization by stable creator ID. This never creates creators
// and never overwrites CRM/contact/research fields.
export const importCreatorPersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: Array<{ id: string; personalized_dm?: string | null; personalized_email_subject?: string | null; personalized_email_body?: string | null; personalization_source?: string | null; personalization_status?: string | null }> }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows required");
    return data;
  })
  .handler(async ({ data, context }) => {
    let updated = 0;
    let skipped = 0;
    for (const row of data.rows) {
      if (!row.id?.trim() || !(row.personalized_dm?.trim() || row.personalized_email_body?.trim() || row.personalization_status?.trim().toLowerCase() === "needs review")) { skipped++; continue; }
      const { data: changed, error } = await context.supabase.from("creators").update({
        personalized_dm: row.personalized_dm?.trim() || null,
        personalized_email_subject: row.personalized_email_subject?.trim() || null,
        personalized_email_body: row.personalized_email_body?.trim() || null,
        personalization_source: row.personalization_source?.trim() || null,
        personalization_status: row.personalization_status?.trim() || (row.personalized_dm?.trim() || row.personalized_email_body?.trim() ? "Ready" : null),
      } as never).eq("id", row.id.trim()).select("id");
      if (error) throw new Error(error.message);
      if ((changed ?? []).length) updated++; else skipped++;
    }
    return { updated, skipped, total: data.rows.length };
  });


export type CreatorQualificationStatus = "Qualified" | "Needs Review" | "Not Relevant";

export const importCreatorQualifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: Array<{ id: string; qualification_status: CreatorQualificationStatus }> }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows required");
    for (const row of data.rows) {
      if (!row.id?.trim()) throw new Error("Creator ID required");
      if (!["Qualified", "Needs Review", "Not Relevant"].includes(row.qualification_status)) {
        throw new Error(`Invalid qualification status for ${row.id}`);
      }
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    let updated = 0;
    let skipped = 0;
    for (const row of data.rows) {
      const { data: changed, error } = await context.supabase
        .from("creators")
        .update({ qualification_status: row.qualification_status } as never)
        .eq("id", row.id.trim())
        .select("id");
      if (error) throw new Error(error.message);
      if ((changed ?? []).length) updated++; else skipped++;
    }
    return { updated, skipped, total: data.rows.length };
  });

/** Add a manually discovered TikTok creator, without duplicating existing handles. */
export const addTikTokOutreachCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { profile: string; name?: string; followers?: string }) => {
    if (!data?.profile) throw new Error("TikTok profile required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const normalized = normalizeCreatorProfile(data.profile, "tiktok");
    if (!normalized) throw new Error("Enter a valid TikTok profile URL, such as https://www.tiktok.com/@americanprepper1");
    const handle = normalized.slice("tiktok:@".length);
    const url = `https://www.tiktok.com/@${handle}`;
    // Check the actual profile column as well as the normalized-domain key,
    // since legacy imports may not have populated normalized_domain.
    const { data: existing, error: lookupError } = await context.supabase
      .from("creators").select("id,name,tiktok,normalized_domain")
      .or(`normalized_domain.eq.${normalized},tiktok.ilike.%${handle}%`)
      .limit(100);
    if (lookupError) throw new Error(lookupError.message);
    const match = (existing ?? []).find((c: any) =>
      c.normalized_domain === normalized || normalizeCreatorProfile(c.tiktok, "tiktok") === normalized
    );
    if (match) return { id: match.id as string, name: match.name as string, created: false };
    const id = `TIKTOK-${handle.toUpperCase()}`;
    const name = data.name?.trim() || `@${handle}`;
    const { data: inserted, error } = await context.supabase.from("creators")
      .upsert({
        id, name, tiktok: url, normalized_domain: normalized,
        primary_platforms: "TikTok", segment: "Preparedness / creator",
        followers_signal: data.followers?.trim() || null,
        qualification_status: "Qualified",
        research_notes: "Manually discovered during TikTok outreach; verify fit before messaging.",
        outreach_owner: "RENA", imported_by: context.userId,
      } as never, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    return { id, name, created: Boolean(inserted?.length) };
  });

// Records one researcher's individual TikTok DM review. Writes ONLY the three
// verification fields for one creator; never touches DMs, status or contact history.
export const recordTikTokDmReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; decision: "verified" | "rejected"; evidence: string; reviewer: string; checks?: { profileOpened: boolean; relevant: boolean; urlCorrect: boolean; dmGrounded: boolean } }) => {
    if (!d?.id) throw new Error("Creator id required");
    const evidence = (d.evidence || "").trim();
    const reviewer = (d.reviewer || "").trim();
    if (!reviewer) throw new Error("Reviewer name required");
    if (d.decision === "verified") {
      const c = d.checks;
      if (!c?.profileOpened || !c.relevant || !c.urlCorrect || !c.dmGrounded) throw new Error("All four checks are required to verify");
      if (evidence.length < 40) throw new Error("Write at least 40 characters of what you saw on the profile");
    } else if (evidence.length < 5) throw new Error("Give a short reason");
    if (evidence.length > 2000) throw new Error("Evidence too long");
    return { id: d.id, decision: d.decision, evidence, reviewer: reviewer.slice(0, 80) };
  })
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const label = data.decision === "verified" ? "Verified for TikTok DM" : "Rejected for TikTok DM";
    const { data: cur, error: e1 } = await context.supabase.from("creators").select("contacted_date").eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("Creator not found");
    const { data: changed, error } = await context.supabase
      .from("creators")
      .update({ full_verification: `${label} — ${data.reviewer} — ${today}`, verification_evidence: data.evidence, verification_date: today } as never)
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!changed?.length) throw new Error("Review not saved (update not permitted)");
    return { ok: true };
  });
