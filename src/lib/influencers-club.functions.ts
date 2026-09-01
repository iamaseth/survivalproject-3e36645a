import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InfluencersClubImportRow = {
  handle: string;
  status: string;
  email?: string | null;
  email_type?: string | null;
  youtube_avg_views?: number | null;
  youtube_engagement_percent?: number | null;
  youtube_has_paid_partnership?: boolean | null;
  youtube_most_recent_post_date?: string | null;
  youtube_promotes_affiliate_links?: boolean | null;
};

function channelIdFromHandle(handle: string): string | null {
  const value = (handle ?? "").trim();
  if (!value) return null;
  const match = value.match(/youtube\.com\/channel\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(value)) return value;
  return null;
}

function compactNote(row: InfluencersClubImportRow): string {
  const parts = ["Influencers Club import"];
  if (row.email_type) parts.push(`email type: ${row.email_type}`);
  if (typeof row.youtube_avg_views === "number" && Number.isFinite(row.youtube_avg_views)) {
    parts.push(`avg views: ${Math.round(row.youtube_avg_views)}`);
  }
  if (typeof row.youtube_engagement_percent === "number" && Number.isFinite(row.youtube_engagement_percent)) {
    parts.push(`engagement: ${row.youtube_engagement_percent}%`);
  }
  if (row.youtube_most_recent_post_date) parts.push(`recent post: ${row.youtube_most_recent_post_date}`);
  if (row.youtube_has_paid_partnership === true) parts.push("paid partnership signal");
  if (row.youtube_promotes_affiliate_links === true) parts.push("affiliate-link signal");
  return parts.join("; ");
}

export const importInfluencersClubReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: InfluencersClubImportRow[] }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows required");
    if (data.rows.length > 1000) throw new Error("Maximum 1,000 rows per import");
    return data;
  })
  .handler(async ({ data, context }) => {
    const parsed = data.rows
      .map((row) => ({ row, channelId: channelIdFromHandle(row.handle) }))
      .filter((x): x is { row: InfluencersClubImportRow; channelId: string } => Boolean(x.channelId));

    const uniqueIds = [...new Set(parsed.map((x) => x.channelId))];
    if (uniqueIds.length === 0) {
      return { total: data.rows.length, matched: 0, updatedEmails: 0, markedNotFound: 0, skippedExistingEmail: 0, unknown: data.rows.length };
    }

    const { data: candidates, error } = await context.supabase
      .from("youtube_candidates")
      .select("channel_id,business_email,notes")
      .in("channel_id", uniqueIds);
    if (error) throw new Error(error.message);

    const byId = new Map((candidates ?? []).map((candidate) => [candidate.channel_id as string, candidate]));
    let matched = 0;
    let updatedEmails = 0;
    let markedNotFound = 0;
    let skippedExistingEmail = 0;

    for (const { row, channelId } of parsed) {
      const existing = byId.get(channelId);
      if (!existing) continue;
      matched++;
      const normalizedStatus = (row.status ?? "").trim().toLowerCase();
      const email = (row.email ?? "").trim();
      const now = new Date().toISOString();

      if (normalizedStatus === "success" && email) {
        const currentEmail = ((existing.business_email as string | null) ?? "").trim();
        if (currentEmail && currentEmail.toLowerCase() !== email.toLowerCase()) {
          skippedExistingEmail++;
          const { error: updateErr } = await context.supabase
            .from("youtube_candidates")
            .update({
              enrichment_status: "found",
              enrichment_checked_at: now,
              enrichment_error: `Influencers Club returned ${email}; existing email preserved`,
            } as never)
            .eq("channel_id", channelId);
          if (updateErr) throw new Error(updateErr.message);
          continue;
        }

        const note = compactNote(row);
        const oldNotes = ((existing.notes as string | null) ?? "").trim();
        const nextNotes = oldNotes.includes(note) ? oldNotes : [oldNotes, note].filter(Boolean).join(" | ");
        const { error: updateErr } = await context.supabase
          .from("youtube_candidates")
          .update({
            business_email: email,
            email_status: "verified",
            email_source: "Influencers Club batch enrichment",
            enrichment_status: "found",
            enrichment_checked_at: now,
            enrichment_error: null,
            notes: nextNotes,
            updated_at: now,
          } as never)
          .eq("channel_id", channelId);
        if (updateErr) throw new Error(updateErr.message);
        updatedEmails++;
      } else if (normalizedStatus === "not_found") {
        const { error: updateErr } = await context.supabase
          .from("youtube_candidates")
          .update({
            enrichment_status: "not_found",
            enrichment_checked_at: now,
            enrichment_error: null,
            updated_at: now,
          } as never)
          .eq("channel_id", channelId);
        if (updateErr) throw new Error(updateErr.message);
        markedNotFound++;
      }
    }

    return {
      total: data.rows.length,
      matched,
      updatedEmails,
      markedNotFound,
      skippedExistingEmail,
      unknown: data.rows.length - matched,
    };
  });
