// Read-only planning endpoint for classified YouTube creator candidates.
// ZERO YouTube API calls. ZERO candidate writes. Never sends outreach.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ROTATED_YOUTUBE_INGEST_SHA256 =
  "96a5e58e2b3cee6ada60cd42ee4fa316294296577f47665a795f5669898a68a3";

const RequestSchema = z.object({
  action: z.literal("creator_contact_queue_report"),
  limit: z.number().int().min(1).max(2000).optional().default(2000),
});

type ExternalLink = Record<string, unknown>;
type Classification = "creator" | "brand_company" | "competitor" | "organization" | "needs_review";

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

function getClassification(externalLinks: unknown): Classification | null {
  if (!Array.isArray(externalLinks)) return null;
  const marker = externalLinks.find(
    (item) => item && typeof item === "object" && (item as ExternalLink).kind === "research_classification",
  ) as ExternalLink | undefined;
  const value = typeof marker?.source === "string" ? marker.source : "";
  return ["creator", "brand_company", "competitor", "organization", "needs_review"].includes(value)
    ? value as Classification
    : null;
}

function publicResearchLinks(externalLinks: unknown) {
  if (!Array.isArray(externalLinks)) return [] as Array<{ kind: string; url: string }>;
  const ignored = new Set(["research_classification"]);
  const out: Array<{ kind: string; url: string }> = [];
  const seen = new Set<string>();

  for (const raw of externalLinks) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as ExternalLink;
    const kind = typeof item.kind === "string" ? item.kind.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url || ignored.has(kind)) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    } catch {
      continue;
    }
    const key = `${kind}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: kind || "other", url });
  }
  return out;
}

export const Route = createFileRoute("/api/public/creator-contact-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const parsed = RequestSchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("youtube_candidates")
          .select("id,channel_id,channel_title,subscriber_count,business_email,description_email,email_source,external_links,enrichment_status")
          .eq("status", "pending")
          .order("subscriber_count", { ascending: false, nullsFirst: false })
          .limit(parsed.data.limit);
        if (error) return json({ error: error.message }, 500);

        let examined = 0;
        let already_contactable = 0;
        let public_link_research = 0;
        let external_research = 0;
        let recommended_now = 0;

        const samples = {
          already_contactable: [] as Array<Record<string, unknown>>,
          public_link_research: [] as Array<Record<string, unknown>>,
          external_research: [] as Array<Record<string, unknown>>,
        };

        for (const row of data ?? []) {
          const classification = getClassification((row as { external_links?: unknown }).external_links);
          if (classification !== "creator") continue;
          examined += 1;

          const businessEmail = String((row as { business_email?: string | null }).business_email || "").trim();
          const descriptionEmail = String((row as { description_email?: string | null }).description_email || "").trim();
          const links = publicResearchLinks((row as { external_links?: unknown }).external_links);
          const hasEmail = Boolean(businessEmail || descriptionEmail);
          const withinTarget = (row as { subscriber_count?: number | null }).subscriber_count == null || Number((row as { subscriber_count?: number | null }).subscriber_count) <= 20000;
          const hasAnyContactPath = hasEmail || links.length > 0;

          if (withinTarget && hasAnyContactPath) recommended_now += 1;

          const summary = {
            id: (row as { id: string }).id,
            channel_id: (row as { channel_id?: string | null }).channel_id ?? null,
            channel_title: (row as { channel_title?: string | null }).channel_title ?? null,
            subscriber_count: (row as { subscriber_count?: number | null }).subscriber_count ?? null,
            has_email: hasEmail,
            link_count: links.length,
            links: links.slice(0, 8),
          };

          if (hasEmail) {
            already_contactable += 1;
            if (samples.already_contactable.length < 10) samples.already_contactable.push(summary);
          } else if (links.length > 0) {
            public_link_research += 1;
            if (samples.public_link_research.length < 20) samples.public_link_research.push(summary);
          } else {
            external_research += 1;
            if (samples.external_research.length < 20) samples.external_research.push(summary);
          }
        }

        return json({
          ok: true,
          examined,
          already_contactable,
          public_link_research,
          external_research,
          recommended_now,
          youtube_api_calls: 0,
          crm_writes: 0,
          samples,
        });
      },
    },
  },
});
