// Protected API for verifying staged YouTube candidates against current public YouTube data.
// Verification never promotes creators and never sends outreach.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ROTATED_YOUTUBE_INGEST_SHA256 =
  "96a5e58e2b3cee6ada60cd42ee4fa316294296577f47665a795f5669898a68a3";

const VerificationRowSchema = z.object({
  id: z.string().uuid(),
  actual_channel_id: z.string().trim().min(3).max(64),
  actual_title: z.string().trim().max(300),
  subscriber_count: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  video_count: z.number().int().min(0).max(1_000_000).optional().nullable(),
  country: z.string().trim().max(8).optional().nullable(),
  verification: z.enum(["verified", "review", "mismatch"]),
  reason: z.string().trim().max(500),
});

const BodySchema = z.object({ rows: z.array(VerificationRowSchema).min(1).max(100) });

type CandidateClassification = "creator" | "brand_company" | "competitor" | "organization" | "needs_review";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
    .from("ingest_tokens").select("token_sha256").eq("name", "youtube_ingest").maybeSingle();
  const providedHash = await sha256Hex(provided);
  const dbHash = !error && tokenRow ? String((tokenRow as { token_sha256: string }).token_sha256) : "";
  return (dbHash ? timingSafeEqualStr(providedHash, dbHash) : false) ||
    timingSafeEqualStr(providedHash, ROTATED_YOUTUBE_INGEST_SHA256);
}

function classification(externalLinks: unknown): CandidateClassification {
  if (!Array.isArray(externalLinks)) return "needs_review";
  const marker = externalLinks.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind === "research_classification") as Record<string, unknown> | undefined;
  const value = typeof marker?.source === "string" ? marker.source : "needs_review";
  return ["creator", "brand_company", "competitor", "organization"].includes(value) ? value as CandidateClassification : "needs_review";
}

function withMarkers(externalLinks: unknown, verification: string, reason: string, actualTitle: string, autoCreator: boolean) {
  const existing = Array.isArray(externalLinks)
    ? externalLinks.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>
    : [];
  const cleaned = existing.filter((item) => item.kind !== "youtube_verification" && (autoCreator ? item.kind !== "research_classification" : true));
  cleaned.push({ kind: "youtube_verification", url: null, source: verification, reason, actual_title: actualTitle, checked_at: new Date().toISOString() });
  if (autoCreator) cleaned.push({ kind: "research_classification", url: null, source: "creator" });
  return cleaned;
}

export const Route = createFileRoute("/api/public/youtube-verification")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const requested = Number(url.searchParams.get("limit") ?? "500");
        const limit = Math.max(1, Math.min(2000, Number.isFinite(requested) ? requested : 500));
        const { data, error } = await supabaseAdmin
          .from("youtube_candidates")
          .select("id,channel_id,channel_url,channel_title,subscriber_count,video_count,country,last_upload_at,external_links,status")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return json({ error: error.message }, 500);

        const rows = data ?? [];
        const channelIds = rows.map((r) => String((r as { channel_id: string }).channel_id)).filter(Boolean);
        const { data: live } = channelIds.length
          ? await supabaseAdmin.from("creators").select("youtube_channel_id").in("youtube_channel_id", channelIds)
          : { data: [] as Array<{ youtube_channel_id: string | null }> };
        const liveIds = new Set((live ?? []).map((r) => String((r as { youtube_channel_id?: string | null }).youtube_channel_id || "")).filter(Boolean));

        return json({
          ok: true,
          rows: rows.map((raw) => {
            const r = raw as Record<string, unknown>;
            return {
              id: r.id,
              channel_id: r.channel_id,
              channel_url: r.channel_url,
              channel_title: r.channel_title,
              subscriber_count: r.subscriber_count,
              video_count: r.video_count,
              country: r.country,
              last_upload_at: r.last_upload_at,
              classification: classification(r.external_links),
              duplicate_live_creator: liveIds.has(String(r.channel_id || "")),
            };
          }),
        });
      },
      POST: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload", issues: parsed.error.issues.slice(0, 10) }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let verified = 0, review = 0, mismatch = 0, autoClassified = 0, missing = 0;
        for (const item of parsed.data.rows) {
          const { data: current, error: readErr } = await supabaseAdmin
            .from("youtube_candidates")
            .select("id,channel_id,external_links,status,last_upload_at")
            .eq("id", item.id).maybeSingle();
          if (readErr) return json({ error: readErr.message }, 500);
          if (!current || (current as { status: string }).status !== "pending") { missing += 1; continue; }

          const sameId = String((current as { channel_id: string }).channel_id) === item.actual_channel_id;
          const finalVerification = sameId ? item.verification : "mismatch";
          const currentClassification = classification((current as { external_links?: unknown }).external_links);
          const recent = !(current as { last_upload_at?: string | null }).last_upload_at ||
            Date.now() - new Date(String((current as { last_upload_at?: string | null }).last_upload_at)).getTime() <= 180 * 86_400_000;
          const autoCreator = finalVerification === "verified" && currentClassification === "needs_review" &&
            item.subscriber_count != null && item.subscriber_count <= 20_000 && recent;

          const { error: updateErr } = await supabaseAdmin.from("youtube_candidates").update({
            channel_title: item.actual_title,
            subscriber_count: item.subscriber_count ?? null,
            video_count: item.video_count ?? null,
            country: item.country ?? null,
            external_links: withMarkers((current as { external_links?: unknown }).external_links, finalVerification, item.reason, item.actual_title, autoCreator),
          } as never).eq("id", item.id);
          if (updateErr) return json({ error: updateErr.message }, 500);
          if (finalVerification === "verified") verified += 1;
          else if (finalVerification === "mismatch") mismatch += 1;
          else review += 1;
          if (autoCreator) autoClassified += 1;
        }
        return json({ ok: true, received: parsed.data.rows.length, verified, review, mismatch, auto_classified_creator: autoClassified, missing });
      },
    },
  },
});
