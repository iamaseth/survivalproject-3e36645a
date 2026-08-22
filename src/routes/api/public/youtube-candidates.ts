// External ingestion endpoint for the existing Google Apps Script + YouTube API
// workflow. Insert-only staging: never writes to `creators`, never sends email.
// Auth is a shared secret header, not a user session.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const emailish = z
  .string()
  .trim()
  .max(320)
  .email()
  .optional()
  .nullable()
  .catch(null);

const CandidateSchema = z.object({
  channel_id: z.string().trim().min(3).max(64),
  channel_url: z.string().trim().max(500).optional().nullable(),
  channel_title: z.string().trim().max(300).optional().nullable(),
  subscriber_count: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  video_count: z.number().int().min(0).max(1_000_000).optional().nullable(),
  country: z.string().trim().max(8).optional().nullable(),
  description_email: emailish,
  business_email: emailish,
  topic_keyword: z.string().trim().max(200).optional().nullable(),
  last_upload_at: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const BodySchema = z.object({
  batch_id: z.string().trim().max(100).optional().nullable(),
  rows: z.array(CandidateSchema).min(1).max(500),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toTimestamp(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const Route = createFileRoute("/api/public/youtube-candidates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["YOUTUBE_INGEST_SECRET"];
        if (!secret) {
          return json({ error: "Ingestion is not configured (missing YOUTUBE_INGEST_SECRET)." }, 503);
        }
        const provided = request.headers.get("x-ingest-secret") ?? "";
        if (!timingSafeEqualStr(provided, secret)) {
          return json({ error: "Unauthorized" }, 401);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.issues.slice(0, 10) }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // De-dup within the batch itself (last row per channel wins).
        const byChannel = new Map<string, z.infer<typeof CandidateSchema>>();
        for (const r of parsed.data.rows) byChannel.set(r.channel_id.trim(), r);
        const incoming = [...byChannel.values()];
        const channelIds = incoming.map((r) => r.channel_id.trim());
        const emails = incoming
          .flatMap((r) => [r.business_email, r.description_email])
          .filter((e): e is string => !!e)
          .map((e) => e.toLowerCase());

        // Already staged?
        const { data: staged, error: stagedErr } = await supabaseAdmin
          .from("youtube_candidates")
          .select("channel_id")
          .in("channel_id", channelIds);
        if (stagedErr) return json({ error: stagedErr.message }, 500);
        const stagedSet = new Set((staged ?? []).map((r) => r.channel_id as string));

        // Already a live creator (channel id or known email)?
        const { data: liveByChannel, error: liveErr } = await supabaseAdmin
          .from("creators")
          .select("id, youtube_channel_id, email")
          .in("youtube_channel_id", channelIds);
        if (liveErr) return json({ error: liveErr.message }, 500);
        const liveChannels = new Set(
          (liveByChannel ?? []).map((r) => r.youtube_channel_id as string).filter(Boolean),
        );

        let liveEmails = new Set<string>();
        if (emails.length > 0) {
          const { data: liveByEmail } = await supabaseAdmin
            .from("creators")
            .select("id, email")
            .in("email", [...new Set(emails)]);
          liveEmails = new Set(
            (liveByEmail ?? []).map((r) => String(r.email ?? "").toLowerCase()).filter(Boolean),
          );
        }

        // Do-not-contact suppression: creators flagged in the workspace.
        const { data: dncRows } = await supabaseAdmin
          .from("creator_workspace")
          .select("creator_id")
          .eq("do_not_contact", true);
        const dncIds = (dncRows ?? []).map((r) => r.creator_id as string);
        let dncEmails = new Set<string>();
        let dncChannels = new Set<string>();
        if (dncIds.length > 0) {
          const { data: dncCreators } = await supabaseAdmin
            .from("creators")
            .select("email, youtube_channel_id")
            .in("id", dncIds);
          dncEmails = new Set(
            (dncCreators ?? []).map((r) => String(r.email ?? "").toLowerCase()).filter(Boolean),
          );
          dncChannels = new Set(
            (dncCreators ?? []).map((r) => String(r.youtube_channel_id ?? "")).filter(Boolean),
          );
        }

        let skippedDuplicate = 0;
        let skippedDnc = 0;
        const toInsert: Array<Record<string, unknown>> = [];

        for (const r of incoming) {
          const channelId = r.channel_id.trim();
          const business = r.business_email?.toLowerCase() ?? null;
          const description = r.description_email?.toLowerCase() ?? null;
          const email = business || description;

          if (stagedSet.has(channelId) || liveChannels.has(channelId)) {
            skippedDuplicate++;
            continue;
          }
          if (email && liveEmails.has(email)) {
            skippedDuplicate++;
            continue;
          }
          const suppressed =
            dncChannels.has(channelId) || (email ? dncEmails.has(email) : false);
          if (suppressed) skippedDnc++;

          toInsert.push({
            channel_id: channelId,
            channel_url: r.channel_url ?? `https://www.youtube.com/channel/${channelId}`,
            channel_title: r.channel_title ?? null,
            subscriber_count: r.subscriber_count ?? null,
            video_count: r.video_count ?? null,
            country: r.country ?? null,
            description_email: description,
            business_email: business,
            topic_keyword: r.topic_keyword ?? null,
            last_upload_at: toTimestamp(r.last_upload_at),
            source: r.source ?? "apps_script",
            source_batch_id: parsed.data.batch_id ?? null,
            notes: r.notes ?? null,
            status: suppressed ? "skipped" : "pending",
            email_status: suppressed ? "suppressed" : email ? "found" : "none",
          });
        }

        let inserted = 0;
        if (toInsert.length > 0) {
          const { data: ins, error: insErr } = await supabaseAdmin
            .from("youtube_candidates")
            .upsert(toInsert as never, { onConflict: "channel_id", ignoreDuplicates: true })
            .select("id");
          if (insErr) return json({ error: insErr.message }, 500);
          inserted = ins?.length ?? 0;
          skippedDuplicate += toInsert.length - inserted;
        }

        return json({
          ok: true,
          received: parsed.data.rows.length,
          inserted,
          skipped_duplicate: skippedDuplicate,
          skipped_do_not_contact: skippedDnc,
        });
      },
    },
  },
});
