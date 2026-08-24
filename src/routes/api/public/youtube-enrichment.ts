// Protected external API for public-data YouTube candidate enrichment.
// Uses the same shared ingest token as YouTube candidate ingestion.
// It never sends outreach and never bypasses CAPTCHA-gated/hidden contact data.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ROTATED_YOUTUBE_INGEST_SHA256 =
  "96a5e58e2b3cee6ada60cd42ee4fa316294296577f47665a795f5669898a68a3";

const ResultSchema = z.object({
  id: z.string().uuid(),
  business_email: z.string().trim().max(320).email().optional().nullable().catch(null),
  email_source: z.string().trim().max(500).optional().nullable(),
  external_links: z.array(z.unknown()).max(100).optional().default([]),
  status: z.enum(["found", "no_email_found", "error"]),
  error: z.string().trim().max(2000).optional().nullable(),
});

const EnrichmentBatchSchema = z.object({
  rows: z.array(ResultSchema).min(1).max(100),
});

const SafeClassificationSchema = z.object({
  action: z.literal("safe_classification_first_pass"),
  limit: z.number().int().min(1).max(2000).optional().default(1500),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(request: Request) {
  const provided = request.headers.get("x-ingest-secret") ?? "";
  if (!provided) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tokenRow, error } = await supabaseAdmin
    .from("ingest_tokens")
    .select("token_sha256")
    .eq("name", "youtube_ingest")
    .maybeSingle();
  const providedHash = await sha256Hex(provided);
  const dbHash = !error && tokenRow ? String((tokenRow as { token_sha256: string }).token_sha256) : "";
  return (dbHash ? timingSafeEqualStr(providedHash, dbHash) : false) ||
    timingSafeEqualStr(providedHash, ROTATED_YOUTUBE_INGEST_SHA256);
}

function validPublicUrl(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function mergeExternalLinks(
  existingRaw: unknown,
  additionsRaw: unknown[],
) {
  const existing = Array.isArray(existingRaw) ? existingRaw.filter((v) => v && typeof v === "object") as Array<Record<string, unknown>> : [];
  const merged = [...existing];
  const seen = new Set(existing.map((item) => `${String(item.kind ?? "")}:${String(item.url ?? "")}`));
  let added = 0;

  for (const raw of additionsRaw) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = validPublicUrl(item.url);
    if (!url) continue;
    const kind = typeof item.kind === "string" && item.kind.trim() ? item.kind.trim().slice(0, 80) : "other";
    const key = `${kind}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ kind, url, source: typeof item.source === "string" ? item.source.slice(0, 200) : "Public YouTube description" });
    added += 1;
  }
  return { merged, added };
}

type CandidateClassification = "creator" | "brand_company" | "competitor" | "organization" | "needs_review";

function getClassification(externalLinks: unknown): CandidateClassification | null {
  if (!Array.isArray(externalLinks)) return null;
  const marker = externalLinks.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind === "research_classification") as Record<string, unknown> | undefined;
  const value = typeof marker?.source === "string" ? marker.source : "";
  return ["creator", "brand_company", "competitor", "organization", "needs_review"].includes(value)
    ? value as CandidateClassification
    : null;
}

function withClassification(externalLinks: unknown, classification: CandidateClassification) {
  const existing = Array.isArray(externalLinks) ? externalLinks.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];
  return [
    ...existing.filter((item) => item.kind !== "research_classification"),
    { kind: "research_classification", url: null, source: classification },
  ];
}

function safeAutoClassification(row: {
  channel_title?: string | null;
  topic_keyword?: string | null;
  video_count?: number | null;
  subscriber_count?: number | null;
  last_upload_at?: string | null;
  notes?: string | null;
}): CandidateClassification | null {
  const title = String(row.channel_title || "").toLowerCase();
  const topic = String(row.topic_keyword || "").toLowerCase();
  const notes = String(row.notes || "").toLowerCase();
  const haystack = `${title} ${topic} ${notes}`;

  // Only high-confidence exclusions are automatic. Ambiguous records stay Needs review.
  const competitor = [
    "legacy food storage", "legacyfoodstorage", "readywise", "4patriots", "my patriot supply",
    "augason farms", "mountain house", "nutristore", "valley food storage",
  ];
  if (competitor.some((term) => haystack.includes(term))) return "competitor";

  const organizationPatterns = [
    /\bfema\b/, /\bred cross\b/, /\bemergency management agency\b/, /\boffice of emergency management\b/,
    /\bdepartment of emergency management\b/, /\bcommunity emergency response team\b/, /\bnational weather service\b/,
    /\bfire department\b/, /\bpolice department\b/, /\bsheriff'?s office\b/, /\bcounty emergency\b/,
    /\bcity of [a-z]/, /\bstate of [a-z]/, /\buniversity extension\b/, /\bcivil defense\b/,
  ];
  if (organizationPatterns.some((rx) => rx.test(title))) return "organization";

  const companyPatterns = [
    /\b(inc\.?|llc|ltd\.?|corp\.?|corporation)\b/, /\bofficial channel\b/, /\bequipment company\b/,
    /\boutdoor products\b/, /\bpreparedness store\b/, /\bsurvival store\b/, /\bgear shop\b/,
    /\bsupply company\b/, /\bmanufacturing\b/, /\btechnologies\b/,
  ];
  if (companyPatterns.some((rx) => rx.test(title))) return "brand_company";

  // Creator classification is deliberately conservative: require activity plus a creator-style title signal.
  const videos = Number(row.video_count ?? 0);
  let recent = true;
  if (row.last_upload_at) {
    const ms = new Date(row.last_upload_at).getTime();
    if (Number.isFinite(ms)) recent = Date.now() - ms <= 180 * 86_400_000;
  }
  const withinSize = row.subscriber_count == null || row.subscriber_count <= 20_000;
  const creatorStylePatterns = [
    /\bwith [a-z]/, /\bmy (?:homestead|adventures?|journey|life|prep)/, /\b[a-z]+['’]s (?:edc|homestead|adventures?|survival|prep)/,
    /\b(?:homesteading|off[ -]?grid living|van life|rv life) with\b/, /\b(?:prepper|survival|bushcraft|outdoors?) podcast\b/,
    /\b(?:gear|camping|hiking|backpacking|edc) reviews?\b/, /\bfamily (?:homestead|preparedness|adventures?)\b/,
  ];
  if (withinSize && recent && videos >= 10 && creatorStylePatterns.some((rx) => rx.test(title))) return "creator";

  return null;
}

async function applyEnrichmentRows(rows: z.infer<typeof ResultSchema>[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let updated = 0;
  let missing = 0;
  let emailAdded = 0;
  let emailConflict = 0;
  let linksAdded = 0;

  for (const item of rows) {
    const { data: current, error: readErr } = await supabaseAdmin
      .from("youtube_candidates")
      .select("id,business_email,description_email,email_source,external_links")
      .eq("id", item.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) { missing += 1; continue; }

    const existingEmail = String((current as { business_email?: string | null }).business_email || (current as { description_email?: string | null }).description_email || "").trim().toLowerCase();
    const proposedEmail = String(item.business_email || "").trim().toLowerCase();
    const sourceUrl = validPublicUrl(item.email_source);
    let newBusinessEmail = (current as { business_email?: string | null }).business_email ?? null;
    let newEmailSource = (current as { email_source?: string | null }).email_source ?? null;

    if (proposedEmail) {
      if (existingEmail && existingEmail !== proposedEmail) {
        emailConflict += 1;
      } else if (!existingEmail && sourceUrl) {
        newBusinessEmail = proposedEmail;
        newEmailSource = sourceUrl;
        emailAdded += 1;
      }
    }

    const merged = mergeExternalLinks((current as { external_links?: unknown }).external_links, item.external_links ?? []);
    linksAdded += merged.added;
    const foundAnything = Boolean(newBusinessEmail || (current as { description_email?: string | null }).description_email || merged.added);

    const { error: updateErr } = await supabaseAdmin
      .from("youtube_candidates")
      .update({
        business_email: newBusinessEmail,
        email_status: newBusinessEmail || (current as { description_email?: string | null }).description_email ? "found" : item.status === "error" ? "error" : "none",
        email_source: newEmailSource,
        external_links: merged.merged,
        enrichment_status: foundAnything ? "found" : item.status,
        enrichment_checked_at: new Date().toISOString(),
        enrichment_error: item.status === "error" ? item.error ?? "Unknown enrichment error" : null,
      } as never)
      .eq("id", item.id);
    if (updateErr) throw new Error(updateErr.message);
    updated += 1;
  }

  return { received: rows.length, updated, missing, emailAdded, emailConflict, linksAdded };
}

async function runSafeClassification(limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("youtube_candidates")
    .select("id,channel_title,topic_keyword,video_count,subscriber_count,last_upload_at,notes,external_links")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const counts = { creator: 0, brand_company: 0, competitor: 0, organization: 0, left_for_review: 0, already_classified: 0 };
  let examined = 0;

  for (const raw of data ?? []) {
    const row = raw as unknown as {
      id: string;
      channel_title?: string | null;
      topic_keyword?: string | null;
      video_count?: number | null;
      subscriber_count?: number | null;
      last_upload_at?: string | null;
      notes?: string | null;
      external_links?: unknown;
    };
    const existing = getClassification(row.external_links);
    if (existing) { counts.already_classified += 1; continue; }
    examined += 1;
    const classification = safeAutoClassification(row);
    if (!classification) { counts.left_for_review += 1; continue; }

    const { error: updateErr } = await supabaseAdmin
      .from("youtube_candidates")
      .update({ external_links: withClassification(row.external_links, classification) } as never)
      .eq("id", row.id);
    if (updateErr) throw new Error(updateErr.message);
    counts[classification] += 1;
  }

  return { ok: true, examined, ...counts };
}

export const Route = createFileRoute("/api/public/youtube-enrichment")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const requested = Number(url.searchParams.get("limit") ?? "100");
        const limit = Math.max(1, Math.min(250, Number.isFinite(requested) ? requested : 100));

        const { data, error } = await supabaseAdmin
          .from("youtube_candidates")
          .select("id,channel_id,channel_url,channel_title,subscriber_count,country,topic_keyword,last_upload_at,enrichment_status")
          .eq("status", "pending")
          .is("business_email", null)
          .is("description_email", null)
          .in("enrichment_status", ["not_started", "error"])
          .order("subscriber_count", { ascending: false, nullsFirst: false })
          .order("last_upload_at", { ascending: false, nullsFirst: false })
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, rows: data ?? [] });
      },

      POST: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const classificationRequest = SafeClassificationSchema.safeParse(raw);
        if (classificationRequest.success) {
          try {
            return json(await runSafeClassification(classificationRequest.data.limit));
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "Classification failed" }, 500);
          }
        }

        const batch = EnrichmentBatchSchema.safeParse(raw);
        if (batch.success) {
          try {
            return json({ ok: true, ...(await applyEnrichmentRows(batch.data.rows)) });
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "Enrichment failed" }, 500);
          }
        }

        const single = ResultSchema.safeParse(raw);
        if (single.success) {
          try {
            return json({ ok: true, ...(await applyEnrichmentRows([single.data])) });
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "Enrichment failed" }, 500);
          }
        }

        return json({ error: "Invalid payload" }, 400);
      },
    },
  },
});