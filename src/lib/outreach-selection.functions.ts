// Read-only creator selection + preview for Outreach Review.
// SAFETY: these functions do not modify creator records and do not send email.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OutreachCandidate = {
  id: string;
  name: string;
  email: string | null;
  segment: string | null;
  youtube: string | null;
  instagram: string | null;
  tiktok: string | null;
  subscriber_count: number | null;
  eligible: boolean;
  reason: string | null;
};

export const listOutreachCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { search?: string; limit?: number } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const limit = Math.min(Math.max(data.limit ?? 200, 1), 500);
    let q = context.supabase
      .from("creators")
      .select("id, name, email, segment, youtube, instagram, tiktok, subscriber_count, response_followup")
      .order("name", { ascending: true })
      .limit(limit);
    const search = (data.search ?? "").trim();
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,segment.ilike.%${search}%`);
    const { data: creators, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (creators ?? []).map((c) => c.id);
    const dnc = new Set<string>();
    const replied = new Set<string>();
    if (ids.length) {
      const { data: workspaces } = await context.supabase
        .from("creator_workspace")
        .select("creator_id, do_not_contact")
        .in("creator_id", ids);
      (workspaces ?? []).forEach((w) => { if (w.do_not_contact) dnc.add(w.creator_id); });
      const { data: replies } = await context.supabase
        .from("creator_reply_classifications")
        .select("creator_id")
        .in("creator_id", ids);
      (replies ?? []).forEach((r) => { if (r.creator_id) replied.add(r.creator_id); });
    }

    const rows: OutreachCandidate[] = (creators ?? []).map((c) => {
      let reason: string | null = null;
      if (!(c.email ?? "").trim()) reason = "No email";
      else if (dnc.has(c.id)) reason = "Do not contact";
      else if ((c.response_followup ?? "").toLowerCase().includes("declined")) reason = "Previously declined";
      else if (replied.has(c.id)) reason = "Already replied";
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        segment: c.segment,
        youtube: c.youtube,
        instagram: c.instagram,
        tiktok: c.tiktok,
        subscriber_count: c.subscriber_count ?? null,
        eligible: reason === null,
        reason,
      };
    });
    return { rows };
  });
