// Protected API for deep public-data enrichment of qualified YouTube creators.
// Purpose: recover public emails/links from recent video descriptions after the first channel-description pass.
// Never sends outreach, never guesses emails, and never bypasses YouTube contact gating/CAPTCHA.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ROTATED_YOUTUBE_INGEST_SHA256 =
  "96a5e58e2b3cee6ada60cd42ee4fa316294296577f47665a795f5669898a68a3";

const ResultSchema = z.object({
  id: z.string().uuid(),
  business_email: z.string().trim().max(320).email().optional().nullable().catch(null),
  email_source: z.string().trim().max(500).optional().nullable(),
  external_links: z.array(z.unknown()).max(100).optional().default([]),
  checked_videos: z.number().int().min(0).max(50).optional().default(0),
  status: z.enum(["found", "no_email_found", "error"]),
  error: z.string().trim().max(2000).optional().nullable(),
});

const BatchSchema = z.object({ rows: z.array(ResultSchema).min(1).max(100) });

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

function mergeExternalLinks(existingRaw: unknown, additionsRaw: unknown[]) {
  const existing = Array.isArray(existingRaw)
    ? existingRaw.filter((v) => v && typeof v === "object") as Array<Record<string, unknown>>
    : [];
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
    merged.push({
      kind,
      url,
      source: typeof item.source === "string" ? item.source.slice(0, 200) : "Public YouTube video description",
    });
    added += 1;
  }
  return { merged, added };
}

function appendNote(existing: unknown, addition: string) {
  const current = String(existing ?? "").trim();
  if (current.includes(addition)) return current;
  return current ? `${current} | ${addition}` : addition;
}

async function applyRows(rows: z.infer<typeof ResultSchema>[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let updated = 0, missing = 0, emailAdded = 0, emailConflict = 0, linksAdded = 0;

  for (const item of rows) {
    const { data: current, error: readErr } = await supabaseAdmin
      .from("youtube_candidates")
      .select("id,business_email,description_email,email_source,external_links,notes")
      .eq("id", item.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) { missing += 1; continue; }

    const existingEmail = String(
      (current as { business_email?: string | null }).business_email ||
      (current as { description_email?: string | null }).description_email || ""
    ).trim().toLowerCase();
    const proposedEmail = String(item.business_email || "").trim().toLowerCase();
    const sourceUrl = validPublicUrl(item.email_source);
    let newBusinessEmail = (current as { business_email?: string | null }).business_email ?? null;
    let newEmailSource = (current as { email_source?: string | null }).email_source ?? null;

    if (proposedEmail) {
      if (existingEmail && existingEmail !== proposedEmail) emailConflict += 1;
      else if (!existingEmail && sourceUrl) {
        newBusinessEmail = proposedEmail;
        newEmailSource = sourceUrl;
        emailAdded += 1;
      }
    }

    const merged = mergeExternalLinks((current as { external_links?: unknown }).external_links, item.external_links ?? []);
    linksAdded += merged.added;
    const foundEmail = Boolean(newBusinessEmail || (current as { description_email?: string | null }).description_email);
    const note = item.status === "error"
      ? `Deep YouTube enrichment error: ${String(item.error || "unknown").slice(0, 300)}`
      : `Deep YouTube pass checked ${item.checked_videos} recent video descriptions; ${foundEmail ? "public email found" : "no public email found"}.`;

    const { error: updateErr } = await supabaseAdmin
      .from("youtube_candidates")
      .update({
        business_email: newBusinessEmail,
        email_status: foundEmail ? "found" : item.status === "error" ? "error" : "none",
        email_source: newEmailSource,
        external_links: merged.merged,
        enrichment_status: foundEmail || merged.added ? "found" : item.status,
        enrichment_checked_at: new Date().toISOString(),
        enrichment_error: item.status === "error" ? item.error ?? "Unknown deep enrichment error" : null,
        notes: appendNote((current as { notes?: string | null }).notes, note),
      } as never)
      .eq("id", item.id);
    if (updateErr) throw new Error(updateErr.message);
    updated += 1;
  }
  return { received: rows.length, updated, missing, emailAdded, emailConflict, linksAdded };
}

export const Route = createFileRoute("/api/public/youtube-deep-enrichment")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const requested = Number(url.searchParams.get("limit") ?? "50");
        const limit = Math.max(1, Math.min(100, Number.isFinite(requested) ? requested : 50));
        const { data, error } = await supabaseAdmin
          .from("youtube_candidates")
          .select("id,channel_id,channel_url,channel_title,subscriber_count,country,topic_keyword,last_upload_at,enrichment_status,notes")
          .eq("status", "kept")
          .is("business_email", null)
          .is("description_email", null)
          .not("notes", "ilike", "%Deep YouTube pass checked%")
          .order("subscriber_count", { ascending: false, nullsFirst: false })
          .order("last_upload_at", { ascending: false, nullsFirst: false })
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, rows: data ?? [] });
      },
      POST: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const parsed = BatchSchema.safeParse(body);
        if (!parsed.success) return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
        try {
          return json({ ok: true, ...(await applyRows(parsed.data.rows)) });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
        }
      },
    },
  },
});
