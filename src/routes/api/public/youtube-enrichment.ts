// Protected external API for a public-data YouTube email-enrichment worker.
// Uses the same shared ingest token as YouTube candidate ingestion.
// It never sends outreach and never bypasses CAPTCHA-gated hidden emails.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ResultSchema = z.object({
  id: z.string().uuid(),
  business_email: z.string().trim().max(320).email().optional().nullable().catch(null),
  email_source: z.string().trim().max(300).optional().nullable(),
  external_links: z.array(z.unknown()).max(100).optional().default([]),
  status: z.enum(["found", "no_email_found", "error"]),
  error: z.string().trim().max(2000).optional().nullable(),
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
  if (error || !tokenRow) return false;
  const providedHash = await sha256Hex(provided);
  return timingSafeEqualStr(providedHash, String((tokenRow as { token_sha256: string }).token_sha256));
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
        const parsed = ResultSchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload", issues: parsed.error.issues.slice(0, 10) }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = parsed.data.business_email?.toLowerCase() ?? null;
        const { error } = await supabaseAdmin
          .from("youtube_candidates")
          .update({
            business_email: email,
            email_status: email ? "found" : parsed.data.status === "error" ? "error" : "none",
            email_source: parsed.data.email_source ?? null,
            external_links: parsed.data.external_links,
            enrichment_status: parsed.data.status,
            enrichment_checked_at: new Date().toISOString(),
            enrichment_error: parsed.data.status === "error" ? parsed.data.error ?? "Unknown enrichment error" : null,
          } as never)
          .eq("id", parsed.data.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      },
    },
  },
});
