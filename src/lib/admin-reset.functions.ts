// Admin Test Data Reset server functions.
// Executive-gated. Every call writes to admin_audit_log.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isExecutive(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "executive").maybeSingle();
  return !!data;
}

async function requireExecutive(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "executive")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: Executive role required to run Test Data Reset.");
}

async function actorMeta(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: prof }, { data: role }] = await Promise.all([
    supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    email: prof?.email ?? null,
    name: prof?.full_name ?? null,
    role: role?.role ?? null,
  };
}

// ---------- Preview ----------
export const getResetPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isExecutive(context.userId))) {
      return { gmailMessages: 0, gmailPollStates: 0, gmailConnections: 0, auditRows: 0 };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [messages, pollState, connections, audit] = await Promise.all([
      supabaseAdmin.from("gmail_messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("gmail_poll_state").select("user_id", { count: "exact", head: true }),
      supabaseAdmin.from("app_user_connections").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("admin_audit_log").select("id", { count: "exact", head: true }),
    ]);
    return {
      gmailMessages: messages.count ?? 0,
      gmailPollStates: pollState.count ?? 0,
      gmailConnections: connections.count ?? 0,
      auditRows: audit.count ?? 0,
    };
  });

// ---------- Reset ----------
export type ResetScope = "test_activity" | "test_creators" | "full";

export const runReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    scope: ResetScope;
    testCreatorIds?: string[];
    /** Number of localStorage overlay rows the client is about to clear; recorded in audit. */
    overlayRowsAffected?: number;
    /** Backup checksum / summary written by the client; recorded in audit. */
    backupSummary?: { fileName: string; sizeBytes: number };
  }) => input)
  .handler(async ({ data, context }) => {
    await requireExecutive(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const affected: Record<string, number> = { overlay_rows: data.overlayRowsAffected ?? 0 };

    if (data.scope === "test_creators") {
      const ids = data.testCreatorIds ?? [];
      if (ids.length > 0) {
        const { count: gm } = await supabaseAdmin
          .from("gmail_messages")
          .delete({ count: "exact" })
          .in("creator_id", ids);
        affected.gmail_messages = gm ?? 0;
      } else {
        affected.gmail_messages = 0;
      }
      affected.gmail_poll_state = 0;
      affected.gmail_connections = 0;
    } else {
      // test_activity + full: wipe cached Gmail messages + poll state for ALL users.
      // Keep app_user_connections (Gmail stays connected) unless full-reset explicitly requests it — we still keep it, per spec.
      const { count: gm } = await supabaseAdmin
        .from("gmail_messages")
        .delete({ count: "exact" })
        .not("id", "is", null);
      affected.gmail_messages = gm ?? 0;

      const { count: ps } = await supabaseAdmin
        .from("gmail_poll_state")
        .delete({ count: "exact" })
        .not("user_id", "is", null);
      affected.gmail_poll_state = ps ?? 0;
      affected.gmail_connections = 0; // preserved intentionally
    }

    const meta = await actorMeta(context.userId);
    const { error: auditErr } = await supabaseAdmin.from("admin_audit_log").insert({
      user_id: context.userId,
      actor_email: meta.email,
      actor_name: meta.name,
      actor_role: meta.role,
      action: "test_data_reset",
      reset_type: data.scope,
      affected_records: affected,
      notes: data.backupSummary
        ? `Backup: ${data.backupSummary.fileName} (${data.backupSummary.sizeBytes} bytes). Gmail connections preserved.`
        : "Gmail connections preserved.",
    });
    if (auditErr) throw auditErr;

    return { ok: true, affected };
  });

// ---------- Audit log ----------
export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isExecutive(context.userId))) return { rows: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_name, actor_email, actor_role, action, reset_type, affected_records, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { rows: data ?? [] };
  });

// ---------- Test-mode audit shim (called from client toggles) ----------
export const recordTestModeEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean; sessionId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const meta = await actorMeta(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: context.userId,
      actor_email: meta.email,
      actor_name: meta.name,
      actor_role: meta.role,
      action: data.enabled ? "test_mode_enabled" : "test_mode_disabled",
      reset_type: null,
      affected_records: { session_id: data.sessionId },
      notes: null,
    });
    return { ok: true };
  });
