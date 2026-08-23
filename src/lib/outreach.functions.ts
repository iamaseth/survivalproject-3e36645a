// Creator Outreach v2 — campaign + queue staging server functions.
// SAFETY: nothing in this file sends email. Sending stays locked until the
// production sender mailbox is connected and round-trip verified.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyMergeFields } from "@/lib/templates";
import { idempotencyKey, notBeforeFor, type QueueStatus } from "@/lib/outreach";

export type CampaignRow = {
  id: string;
  name: string;
  goal: string | null;
  product_context: string | null;
  sample_policy: string | null;
  allowed_offer_notes: string | null;
  forbidden_promises: string | null;
  brand_tone: string | null;
  default_template_id: string | null;
  daily_send_cap: number;
  status: string;
  sending_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type QueueItemRow = {
  id: string;
  campaign_id: string;
  creator_id: string;
  creator_name: string | null;
  sequence_step: number;
  idempotency_key: string;
  template_id: string | null;
  recipient_email: string | null;
  subject_snapshot: string | null;
  body_snapshot: string | null;
  not_before: string;
  status: QueueStatus;
  attempt_count: number;
  error_reason: string | null;
  cancelled_reason: string | null;
  gmail_message_id: string | null;
  sent_at: string | null;
  created_at: string;
};

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("outreach_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as CampaignRow[] };
  });

export const upsertCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id?: string;
    name: string;
    goal?: string | null;
    product_context?: string | null;
    sample_policy?: string | null;
    allowed_offer_notes?: string | null;
    forbidden_promises?: string | null;
    brand_tone?: string | null;
    default_template_id?: string | null;
    daily_send_cap?: number;
    status?: string;
  }) => {
    if (!data?.name?.trim()) throw new Error("Campaign name is required");
    if (data.daily_send_cap != null && data.daily_send_cap < 1) {
      throw new Error("Daily send cap must be at least 1");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name.trim(),
      goal: data.goal ?? null,
      product_context: data.product_context ?? null,
      sample_policy: data.sample_policy ?? null,
      allowed_offer_notes: data.allowed_offer_notes ?? null,
      forbidden_promises: data.forbidden_promises ?? null,
      brand_tone: data.brand_tone ?? null,
      default_template_id: data.default_template_id || null,
      daily_send_cap: data.daily_send_cap ?? 25,
      status: data.status ?? "draft",
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("outreach_campaigns")
        .update(payload as never)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { row: row as CampaignRow };
    }
    const { data: row, error } = await context.supabase
      .from("outreach_campaigns")
      .insert({ ...payload, created_by: context.userId } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { row: row as CampaignRow };
  });

export const listQueueItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId: string }) => {
    if (!data?.campaignId) throw new Error("campaignId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("outreach_queue_items")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .order("sequence_step", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.creator_id)));
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: creators } = await context.supabase
        .from("creators")
        .select("id, name")
        .in("id", ids);
      (creators ?? []).forEach((c) => nameById.set(c.id, c.name));
    }
    const items = (rows ?? []).map((r) => ({
      ...r,
      creator_name: nameById.get(r.creator_id) ?? null,
    })) as QueueItemRow[];
    const counts: Record<string, number> = {};
    items.forEach((i) => { counts[i.status] = (counts[i.status] ?? 0) + 1; });
    return { items, counts };
  });

/**
 * Idempotent preparation. Re-running for the same campaign + creator + step
 * is a no-op thanks to the unique idempotency key. Ineligible creators
 * (no email, do-not-contact, declined, or already replied) are skipped.
 */
export const prepareQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId: string; sequenceStep?: number; creatorIds?: string[]; limit?: number }) => {
    if (!data?.campaignId) throw new Error("campaignId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const step = data.sequenceStep ?? 1;
    const limit = Math.min(data.limit ?? 100, 500);

    const { data: campaign, error: cErr } = await context.supabase
      .from("outreach_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .single();
    if (cErr || !campaign) throw new Error(cErr?.message ?? "Campaign not found");

    let creatorQuery = context.supabase
      .from("creators")
      .select("id, name, email, segment, instagram, tiktok, youtube, facebook, response_followup")
      .not("email", "is", null);
    if (data.creatorIds?.length) creatorQuery = creatorQuery.in("id", data.creatorIds);
    const { data: creators, error: crErr } = await creatorQuery.limit(limit * 3);
    if (crErr) throw new Error(crErr.message);

    const { data: workspaces } = await context.supabase
      .from("creator_workspace")
      .select("creator_id, do_not_contact");
    const dnc = new Set(
      (workspaces ?? []).filter((w) => w.do_not_contact).map((w) => w.creator_id),
    );

    const { data: rejected } = await context.supabase
      .from("creator_reply_classifications")
      .select("creator_id, category")
      .in("category", ["rejected", "interested", "ask_price", "ask_sample", "posted"]);
    const replied = new Set((rejected ?? []).map((r) => r.creator_id).filter(Boolean) as string[]);

    type TemplateSnapshot = { id: string; subject: string; body: string; image_url: string | null; image_alt: string | null };
    let template: TemplateSnapshot | null = null;
    if (campaign.default_template_id) {
      const { data: t } = await context.supabase
        .from("email_templates")
        .select("id, subject, body, image_url, image_alt")
        .eq("id", campaign.default_template_id)
        .maybeSingle();
      template = (t as TemplateSnapshot | null) ?? null;
    }

    const skipped: Array<{ id: string; reason: string }> = [];
    const rows: Record<string, unknown>[] = [];
    for (const c of creators ?? []) {
      if (rows.length >= limit) break;
      const email = (c.email ?? "").trim();
      if (!email) { skipped.push({ id: c.id, reason: "no email" }); continue; }
      if (dnc.has(c.id)) { skipped.push({ id: c.id, reason: "do not contact" }); continue; }
      if ((c.response_followup ?? "").toLowerCase().includes("declined")) {
        skipped.push({ id: c.id, reason: "declined" }); continue;
      }
      if (step > 1 && replied.has(c.id)) { skipped.push({ id: c.id, reason: "already replied" }); continue; }

      const ctx = {
        creator_name: c.name || "there",
        platform: c.instagram ? "Instagram" : c.tiktok ? "TikTok" : c.youtube ? "YouTube" : c.facebook ? "Facebook" : "",
        handle: c.instagram || c.tiktok || c.youtube || c.facebook || "",
        segment: c.segment || "your niche",
        sender_first_name: "The team",
      };
      rows.push({
        campaign_id: campaign.id,
        creator_id: c.id,
        sequence_step: step,
        idempotency_key: idempotencyKey(campaign.id, c.id, step),
        template_id: template?.id ?? null,
        recipient_email: email,
        subject_snapshot: template ? applyMergeFields(template.subject, ctx) : null,
        body_snapshot: template ? applyMergeFields(template.body, ctx) : null,
        image_url: template?.image_url ?? null,
        image_alt: template?.image_alt ?? null,
        not_before: notBeforeFor(step),
        status: "pending",
        created_by: context.userId,
      });
    }

    let inserted = 0;
    if (rows.length) {
      const { data: out, error } = await context.supabase
        .from("outreach_queue_items")
        .upsert(rows as never, { onConflict: "idempotency_key", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(error.message);
      inserted = (out ?? []).length;
    }
    return {
      considered: rows.length + skipped.length,
      inserted,
      duplicates: rows.length - inserted,
      skipped,
    };
  });

export const setQueueItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "approved" | "skipped" | "cancelled" | "pending"; reason?: string }) => {
    if (!data?.id) throw new Error("id required");
    if (!["approved", "skipped", "cancelled", "pending"].includes(data.status)) {
      throw new Error("Unsupported status transition");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: current, error: curErr } = await context.supabase
      .from("outreach_queue_items")
      .select("status")
      .eq("id", data.id)
      .single();
    if (curErr) throw new Error(curErr.message);
    if (current.status === "sent") throw new Error("Sent items cannot be changed");
    if (current.status === "cancelled") throw new Error("Cancelled items cannot be reactivated");

    const { error } = await context.supabase
      .from("outreach_queue_items")
      .update({ status: data.status, cancelled_reason: data.reason ?? null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Cancels not-yet-sent follow-ups for creators who replied or are DNC/declined. */
export const suppressIneligibleQueueItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const { data: classifications } = await context.supabase
      .from("creator_reply_classifications")
      .select("creator_id");
    const { data: workspaces } = await context.supabase
      .from("creator_workspace")
      .select("creator_id, do_not_contact");
    const ids = new Set<string>();
    (classifications ?? []).forEach((c) => c.creator_id && ids.add(c.creator_id));
    (workspaces ?? []).forEach((w) => { if (w.do_not_contact) ids.add(w.creator_id); });
    if (!ids.size) return { cancelled: 0 };

    let q = context.supabase
      .from("outreach_queue_items")
      .update({ status: "cancelled", cancelled_reason: "Reply received or creator marked do-not-contact" } as never)
      .in("creator_id", Array.from(ids))
      .in("status", ["pending", "approved"]);
    if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
    const { data: out, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { cancelled: (out ?? []).length };
  });
