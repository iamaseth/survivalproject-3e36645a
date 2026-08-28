// Creator Outreach v2 — deterministic reply triage.
// SAFETY: additive only. This module never deletes creators, reviewed data,
// archives, Gmail messages, or queue rows, and it never sends email.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyCreatorReplyDeterministically } from "@/lib/reply-classifier";

export type ReplyTriageRow = {
  gmail_message_id: string;
  creator_id: string | null;
  creator_name: string | null;
  snippet: string | null;
  sent_at: string | null;
  from_email: string | null;
  category: string;
  confidence: number;
  risk_flags: string[];
  next_action: string | null;
  requires_human_review: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};


/**
 * Classify stored incoming Gmail replies that do not yet have a classification.
 * Raw Gmail rows are left untouched. Re-running is idempotent because
 * creator_reply_classifications.gmail_message_id is unique.
 */
export const classifyUntriagedCreatorReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(input?.limit ?? 50, 1), 200),
  }))
  .handler(async ({ data, context }) => {
    const { data: incoming, error: incomingError } = await context.supabase
      .from("gmail_messages")
      .select("gmail_message_id, creator_id, body_text, snippet")
      .eq("direction", "received")
      .not("gmail_message_id", "is", null)
      .order("sent_at", { ascending: false })
      .limit(data.limit * 3);

    if (incomingError) throw new Error(incomingError.message);
    if (!incoming?.length) return { considered: 0, inserted: 0, skipped: 0 };

    const messageIds = incoming.map((m) => m.gmail_message_id).filter(Boolean) as string[];
    const { data: existing, error: existingError } = await context.supabase
      .from("creator_reply_classifications")
      .select("gmail_message_id")
      .in("gmail_message_id", messageIds);

    if (existingError) throw new Error(existingError.message);
    const alreadyClassified = new Set((existing ?? []).map((r) => r.gmail_message_id));

    const rows: Array<Record<string, unknown>> = [];
    let skipped = 0;

    for (const message of incoming) {
      if (rows.length >= data.limit) break;
      if (!message.gmail_message_id || alreadyClassified.has(message.gmail_message_id)) {
        skipped += 1;
        continue;
      }

      const text = (message.body_text ?? message.snippet ?? "").trim();
      const classification = classifyCreatorReplyDeterministically(text);

      rows.push({
        gmail_message_id: message.gmail_message_id,
        creator_id: message.creator_id ?? null,
        category: classification.category,
        confidence: classification.confidence,
        risk_flags: classification.riskFlags,
        next_action: classification.nextAction,
        requires_human_review: classification.requiresHumanReview,
        classifier_version: "deterministic-v1",
      });
    }

    if (!rows.length) {
      return { considered: incoming.length, inserted: 0, skipped };
    }

    const { data: inserted, error: insertError } = await context.supabase
      .from("creator_reply_classifications")
      .upsert(rows as never, { onConflict: "gmail_message_id", ignoreDuplicates: true })
      .select("gmail_message_id");

    if (insertError) throw new Error(insertError.message);

    return {
      considered: incoming.length,
      inserted: inserted?.length ?? 0,
      skipped,
    };
  });

/** Human-review inbox. Nothing here automatically changes creator status. */
export const listReplyTriage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { onlyNeedsReview?: boolean; limit?: number } | undefined) => ({
    onlyNeedsReview: input?.onlyNeedsReview ?? true,
    limit: Math.min(Math.max(input?.limit ?? 100, 1), 500),
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("creator_reply_classifications")
      .select("gmail_message_id, creator_id, category, confidence, risk_flags, next_action, requires_human_review, reviewed_by, reviewed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.onlyNeedsReview) {
      query = query.eq("requires_human_review", true).is("reviewed_at", null);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    if (!rows?.length) return { rows: [] as ReplyTriageRow[] };

    // Read-only enrichment: raw Gmail rows are never modified here.
    const messageIds = rows.map((r) => r.gmail_message_id);
    const { data: messages } = await context.supabase
      .from("gmail_messages")
      .select("gmail_message_id, snippet, sent_at, from_email")
      .in("gmail_message_id", messageIds);
    const byMessage = new Map((messages ?? []).map((m) => [m.gmail_message_id, m]));

    const creatorIds = Array.from(new Set(rows.map((r) => r.creator_id).filter(Boolean) as string[]));
    const nameById = new Map<string, string>();
    if (creatorIds.length) {
      const { data: creators } = await context.supabase
        .from("creators")
        .select("id, name")
        .in("id", creatorIds);
      (creators ?? []).forEach((c) => nameById.set(c.id, c.name));
    }

    const enriched: ReplyTriageRow[] = rows.map((r) => {
      const m = byMessage.get(r.gmail_message_id);
      return {
        gmail_message_id: r.gmail_message_id,
        creator_id: r.creator_id,
        creator_name: r.creator_id ? nameById.get(r.creator_id) ?? null : null,
        snippet: m?.snippet ?? null,
        sent_at: m?.sent_at ?? null,
        from_email: m?.from_email ?? null,
        category: r.category,
        confidence: Number(r.confidence),
        risk_flags: Array.isArray(r.risk_flags) ? r.risk_flags.map((f) => String(f)) : [],
        next_action: r.next_action,
        requires_human_review: r.requires_human_review,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
      };
    });

    return { rows: enriched };
  });


/**
 * Mark a classification reviewed. This is the only state change here and it
 * affects only the additive classification row.
 */
export const markReplyTriageReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gmailMessageId: string }) => {
    if (!input?.gmailMessageId?.trim()) throw new Error("gmailMessageId required");
    return { gmailMessageId: input.gmailMessageId.trim() };
  })
  .handler(async ({ data, context }) => {
    const reviewedAt = new Date().toISOString();
    const { error } = await context.supabase
      .from("creator_reply_classifications")
      .update({ reviewed_by: context.userId, reviewed_at: reviewedAt } as never)
      .eq("gmail_message_id", data.gmailMessageId);

    if (error) throw new Error(error.message);
    return { ok: true, reviewedAt };
  });
