// Server functions for approved email templates.
// All authenticated; RLS enforces team-member scope. Approval verifies role
// server-side and stamps via the admin client (bypasses RLS but keeps the
// role check in-process).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EmailTemplate } from "./templates";

function rowToTemplate(r: Record<string, unknown>): EmailTemplate {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    segment: (r.segment as string | null) ?? null,
    subject: String(r.subject ?? ""),
    body: String(r.body ?? ""),
    imageUrl: (r.image_url as string | null) ?? null,
    imageAlt: (r.image_alt as string | null) ?? null,
    createdBy: String(r.created_by ?? ""),
    approvedBy: (r.approved_by as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    active: Boolean(r.active),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { activeOnly?: boolean } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("email_templates")
      .select("*")
      .order("updated_at", { ascending: false });
    if (data.activeOnly) q = q.eq("active", true);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { templates: (rows ?? []).map(rowToTemplate) };
  });

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    name: string;
    segment?: string | null;
    subject: string;
    body: string;
    imageUrl?: string | null;
    imageAlt?: string | null;
  }) => {
    if (!input.name?.trim()) throw new Error("Template name is required");
    if (input.name.trim().length > 120) throw new Error("Template name is too long");
    return {
      id: input.id,
      name: input.name.trim(),
      segment: input.segment?.trim() || null,
      subject: input.subject ?? "",
      body: input.body ?? "",
      imageUrl: input.imageUrl?.trim() || null,
      imageAlt: input.imageAlt?.trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      segment: data.segment,
      subject: data.subject,
      body: data.body,
      image_url: data.imageUrl,
      image_alt: data.imageAlt,
    } satisfies Record<string, unknown>;

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("email_templates")
        .update(payload as never)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw error;
      return { template: rowToTemplate(row) };
    }

    const { data: row, error } = await context.supabase
      .from("email_templates")
      .insert({
        ...payload,
        created_by: context.userId,
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return { template: rowToTemplate(row) };
  });

// Kept for compatibility with the existing Templates UI. Global operating
// rules require explicit approval before any destructive use of this action.
export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Template id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const PERMANENT_TEMPLATE_APPROVER_EMAILS = new Set([
  "atp@globenetcapitalgroup.com",
  "ellezolie@gmail.com",
  "2phabulous@gmail.com",
  "renas1503@gmail.com",
]);

async function requireTemplateApprover(context: { supabase: any; userId: string; claims?: Record<string, unknown> }) {
  // The authenticated email roster is authoritative for known permanent team
  // approvers. This prevents a stale user_roles row from blocking a verified
  // Executive/Partnership Manager account, while still requiring authentication.
  const email = String(context.claims?.email ?? "").trim().toLowerCase();
  if (email && PERMANENT_TEMPLATE_APPROVER_EMAILS.has(email)) return;

  const { data: roleRows, error: roleErr } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (roleErr) throw roleErr;
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const canApprove = roles.includes("executive") || roles.includes("partnership_manager");
  if (!canApprove) {
    throw new Error("Only Executives or Partnership Managers can approve templates.");
  }
}

export const approveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Template id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireTemplateApprover(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("email_templates")
      .update({
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        active: true,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return { template: rowToTemplate(row) };
  });

// Starter templates are static so this action never spends Lovable AI credits.
// Use the official Survival Tabs site image as the default starter photo. Existing
// starter text is never overwritten; re-running this only fills a missing image.
const STARTER_IMAGE_URL =
  "https://cdn.shopify.com/s/files/1/0409/4735/1720/t/2/assets/thesurvivaltabshomeamazon3-1641333286382.png?v=1641333289";
const STARTER_IMAGE_ALT = "Survival Tabs emergency nutrition product";

const STARTERS: Array<{ name: string; subject: string; body: string }> = [
  {
    name: "Initial Outreach (starter)",
    subject: "Survival Tabs × {{creator_name}}",
    body: "Hi {{creator_name}},\n\nI came across your work on {{platform}} ({{handle}}) and thought Survival Tabs could be a useful fit for your audience. We make compact emergency food tablets with a 25-year shelf life, designed for preparedness, camping and emergency kits.\n\nWe would be happy to send you a sample pack for honest feedback, with no obligation to post. If you are interested, just reply and we can arrange shipping.\n\nBest,\n{{sender_first_name}}",
  },
  {
    name: "Follow-up (starter)",
    subject: "Quick follow-up — Survival Tabs",
    body: "Hi {{creator_name}},\n\nJust following up on my earlier note about Survival Tabs. I know inboxes get busy, so no pressure at all. If a compact emergency-food product would be useful for your {{platform}} audience, we would be glad to send a sample for you to evaluate.\n\nIf it is not a fit right now, no problem.\n\nBest,\n{{sender_first_name}}",
  },
  {
    name: "Thank You (starter)",
    subject: "Thank you from Survival Tabs",
    body: "Hi {{creator_name}},\n\nThank you for taking the time to feature Survival Tabs on {{platform}}. We appreciate the care you put into sharing your experience with your audience.\n\nIf you need product details, images, or anything else for follow-up content, please let us know.\n\nBest,\n{{sender_first_name}}",
  },
  {
    name: "Shipping (starter)",
    subject: "Your Survival Tabs sample is on the way",
    body: "Hi {{creator_name}},\n\nYour Survival Tabs sample has shipped.\n\nTracking: [TRACKING]\nExpected delivery: [ETA]\n\nPlease let us know when it arrives or if there are any delivery issues.\n\nBest,\n{{sender_first_name}}",
  },
  {
    name: "Campaign Invitation (starter)",
    subject: "Paid Survival Tabs collaboration",
    body: "Hi {{creator_name}},\n\nWe are planning a paid Survival Tabs creator campaign and think your {{platform}} content could be a strong fit. We would like to discuss a compensated collaboration and learn your current rate for sponsored content.\n\nIf you are interested, please send your rate card or preferred collaboration terms and we can review the next steps.\n\nBest,\n{{sender_first_name}}",
  },
  {
    name: "Collaboration Proposal (starter)",
    subject: "Collaboration proposal — Survival Tabs × {{creator_name}}",
    body: "Hi {{creator_name}},\n\nWe would like to explore a paid partnership with you around Survival Tabs. A possible package would include one dedicated or integrated video plus two supporting story/social placements, with final deliverables and usage terms agreed together before production.\n\nIf this sounds relevant, please send your current rates and any preferred partnership structure.\n\nBest,\n{{sender_first_name}}",
  },
];

export const approveStarterEmailTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTemplateApprover(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const names = STARTERS.map((x) => x.name);
    const approvedAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("email_templates")
      .update({ approved_by: context.userId, approved_at: approvedAt, active: true })
      .in("name", names)
      .select("id, name");
    if (error) throw error;
    return { approved: data ?? [], approvedAt };
  });

export const seedStarterEmailTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const names = STARTERS.map((x) => x.name);
    const { data: existingRows, error: existingErr } = await context.supabase
      .from("email_templates")
      .select("name, image_url, image_alt")
      .in("name", names);
    if (existingErr) throw existingErr;

    const existingByName = new Map(
      (existingRows ?? []).map((r) => [String(r.name), r] as const),
    );
    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const starter of STARTERS) {
      const existing = existingByName.get(starter.name);
      if (existing) {
        if (!existing.image_url) {
          const { error } = await context.supabase
            .from("email_templates")
            .update({
              image_url: STARTER_IMAGE_URL,
              image_alt: existing.image_alt || STARTER_IMAGE_ALT,
            } as never)
            .eq("name", starter.name);
          if (error) throw error;
          updated.push(starter.name);
        } else {
          skipped.push(starter.name);
        }
        continue;
      }

      const { error } = await context.supabase.from("email_templates").insert({
        name: starter.name,
        segment: null,
        subject: starter.subject,
        body: starter.body,
        image_url: STARTER_IMAGE_URL,
        image_alt: STARTER_IMAGE_ALT,
        created_by: context.userId,
      } as never);
      if (error) throw error;
      created.push(starter.name);
    }
    return { created, updated, skipped };
  });
