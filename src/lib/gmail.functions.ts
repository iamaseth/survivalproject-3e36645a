// Gmail App User Connector server functions.
// Called from client via useServerFn — Supabase bearer is attached automatically.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREATOR_GMAIL_LABELS, labelForStage } from "./gmail-labels";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

function isReconnectStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function parseGmailErrorReason(text: string): string {
  try {
    const j = JSON.parse(text);
    const err = j?.error;
    if (err?.message) return err.message;
    if (err?.status) return err.status;
    if (typeof err === "string") return err;
  } catch { /* not JSON */ }
  return text.slice(0, 300);
}

export const getGmailConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!key) return { connected: false as const, needsReconnect: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("gmail_poll_state")
      .select("email_address, last_polled_at, last_success_at, last_error_status, last_error_reason, last_error_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const needsReconnect = !!data?.last_error_status && isReconnectStatus(data.last_error_status);
    return {
      connected: true as const,
      needsReconnect,
      emailAddress: data?.email_address ?? null,
      lastPolledAt: data?.last_polled_at ?? null,
      lastSuccessAt: data?.last_success_at ?? null,
      lastErrorStatus: data?.last_error_status ?? null,
      lastErrorReason: data?.last_error_reason ?? null,
      lastErrorAt: data?.last_error_at ?? null,
    };
  });

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetOrigin: string }) => input)
  .handler(async ({ data, context }) => {
    const clientKey = process.env.GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientKey) throw new Error("Gmail client is not configured for this project.");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl: data.targetOrigin,
      responseMode: "web_message",
      webMessageTargetOrigin: data.targetOrigin,
      credentialsConfiguration: {
        scopes: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.compose",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.labels",
        ],
      },
    });
    return { authorizationUrl };
  });

export const saveGmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionAPIKey: string }) => input)
  .handler(async ({ data, context }) => {
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    await saveConnectionKeyForUser(context.userId, CONNECTOR_ID, data.connectionAPIKey);
    try {
      const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
      const profileRes = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: data.connectionAPIKey,
        connectorId: CONNECTOR_ID, path: "/gmail/v1/users/me/profile",
      });
      const profile = profileRes.ok ? (await profileRes.json()) as { emailAddress?: string } : null;
      const labelIds = await ensureLabelsExist(data.connectionAPIKey);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("gmail_poll_state").upsert({
        user_id: context.userId,
        email_address: profile?.emailAddress ?? null,
        label_ids: labelIds,
        last_error_status: null,
        last_error_reason: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      return { ok: true, emailAddress: profile?.emailAddress ?? null };
    } catch (e) {
      return { ok: true, emailAddress: null, warning: e instanceof Error ? e.message : String(e) };
    }
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (key) {
      try {
        const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
        await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: CONNECTOR_ID });
      } catch { /* ignore — still remove locally */ }
    }
    await deleteConnectionKeyForUser(context.userId, CONNECTOR_ID);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("gmail_poll_state").delete().eq("user_id", context.userId);
    return { ok: true };
  });

async function ensureLabelsExist(connectionAPIKey: string): Promise<Record<string, string>> {
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  const listRes = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID, path: "/gmail/v1/users/me/labels" });
  if (!listRes.ok) return {};
  const listData = await listRes.json() as { labels?: Array<{ id: string; name: string }> };
  const existing = new Map((listData.labels ?? []).map((l) => [l.name, l.id]));
  const out: Record<string, string> = {};
  for (const name of CREATOR_GMAIL_LABELS) {
    const found = existing.get(name);
    if (found) { out[name] = found; continue; }
    const createRes = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/labels",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }) },
    });
    if (createRes.ok) {
      const created = await createRes.json() as { id: string };
      out[name] = created.id;
    }
  }
  return out;
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildRawEmail(opts: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  from?: string;
  inReplyTo?: string;
  references?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}): string {
  const headers = [
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    opts.from ? `From: ${opts.from}` : "",
    `Subject: ${opts.subject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : "",
    opts.references ? `References: ${opts.references}` : "",
    "MIME-Version: 1.0",
  ].filter(Boolean);

  if (!opts.imageUrl) {
    return encodeBase64Url([...headers, 'Content-Type: text/plain; charset="UTF-8"', "", opts.body].join("\r\n"));
  }

  const boundary = `survival-tabs-${crypto.randomUUID()}`;
  const htmlBody = escapeHtml(opts.body).replace(/\r?\n/g, "<br>");
  const safeUrl = escapeHtml(opts.imageUrl);
  const safeAlt = escapeHtml(opts.imageAlt || "Survival Tabs product image");
  const html = `<div style="font-family:Arial,sans-serif;white-space:normal;line-height:1.5">${htmlBody}<div style="margin-top:20px"><img src="${safeUrl}" alt="${safeAlt}" style="max-width:600px;width:100%;height:auto;display:block;border:0" /></div></div>`;
  const mime = [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.body,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return encodeBase64Url(mime);
}

export type SendGmailResult =
  | { ok: true; messageId: string; threadId: string; sentAt: string }
  | { ok: false; status: number; reason: string; needsReconnect: boolean };

export const sendGmailToCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    creatorId: string;
    creatorEmail: string;
    creatorName?: string;
    subject: string;
    body: string;
    imageUrl?: string | null;
    imageAlt?: string | null;
    cc?: string;
    threadId?: string;
    inReplyTo?: string;
    stage?: string;
  }) => input)
  .handler(async ({ data, context }): Promise<SendGmailResult> => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const logError = async (status: number, reason: string, senderEmail: string | null) => {
      await supabaseAdmin.from("gmail_send_errors").insert({
        user_id: context.userId, sender_email: senderEmail, creator_id: data.creatorId,
        creator_name: data.creatorName ?? null, recipient: data.creatorEmail, action: "send",
        http_status: status, error_reason: reason, subject: data.subject,
      });
    };
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!connectionAPIKey) {
      await logError(0, "Gmail not connected for this user.", null);
      return { ok: false, status: 0, reason: "Gmail is not connected. Connect your Gmail in Settings first.", needsReconnect: true };
    }
    const { data: state } = await supabaseAdmin.from("gmail_poll_state").select("label_ids, email_address").eq("user_id", context.userId).maybeSingle();
    const senderEmail = state?.email_address ?? null;
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const raw = buildRawEmail({
      to: data.creatorName ? `${data.creatorName} <${data.creatorEmail}>` : data.creatorEmail,
      cc: data.cc, subject: data.subject, body: data.body,
      imageUrl: data.imageUrl, imageAlt: data.imageAlt,
      inReplyTo: data.inReplyTo, references: data.inReplyTo,
    });
    const sendRes = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/messages/send",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw, ...(data.threadId ? { threadId: data.threadId } : {}) }) },
    });
    if (!sendRes.ok) {
      const text = await sendRes.text();
      const reason = parseGmailErrorReason(text);
      const needsReconnect = isReconnectStatus(sendRes.status);
      await logError(sendRes.status, reason, senderEmail);
      if (needsReconnect) {
        await supabaseAdmin.from("gmail_poll_state").upsert({ user_id: context.userId, last_error_status: sendRes.status, last_error_reason: reason, last_error_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      }
      return { ok: false, status: sendRes.status, reason, needsReconnect };
    }
    const sent = await sendRes.json() as { id: string; threadId: string; labelIds?: string[] };
    const labels = (state?.label_ids ?? {}) as Record<string, string>;
    const stageLabel = labelForStage(data.stage);
    const addLabelIds = [labels["Creator Partnerships"], labels[stageLabel]].filter(Boolean) as string[];
    if (addLabelIds.length > 0) {
      await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID, path: `/gmail/v1/users/me/messages/${sent.id}/modify`, init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addLabelIds }) } });
    }
    const sentAt = new Date().toISOString();
    await supabaseAdmin.from("gmail_messages").upsert({
      user_id: context.userId, creator_id: data.creatorId, gmail_message_id: sent.id,
      gmail_thread_id: sent.threadId, direction: "sent", from_email: senderEmail,
      to_emails: [data.creatorEmail], subject: data.subject, snippet: data.body.slice(0, 200),
      body_text: data.body, label_ids: addLabelIds, sent_at: sentAt,
    }, { onConflict: "user_id,gmail_message_id" });
    await supabaseAdmin.from("gmail_poll_state").upsert({ user_id: context.userId, last_error_status: null, last_error_reason: null, last_error_at: null, last_success_at: sentAt, updated_at: sentAt }, { onConflict: "user_id" });
    return { ok: true, messageId: sent.id, threadId: sent.threadId, sentAt };
  });

export type DraftMode =
  | "Initial Outreach" | "Follow-up" | "Thank You" | "Shipping"
  | "Campaign Invitation" | "Collaboration Proposal"
  | "Rewrite" | "Shorter" | "Friendlier" | "More Professional";

const SYSTEM_PROMPT = `You write short, warm, professional emails on behalf of the Survival Tabs Creator Partnerships team to influencers and content creators. Survival Tabs makes emergency food ration bars (~1200 calories/tab, 25-year shelf life) beloved by prepper, camping, hunting, EDC, homestead and off-grid creators. Voice: confident, respectful of the creator's audience, no hype, no emojis. Length: 90-140 words unless asked for shorter. Always include a subject line as the FIRST line prefixed exactly "Subject: ". Then a blank line. Then the body. Do not include salutation placeholders like [Name] — use the provided creator name. Sign off with the sender's first name only.`;

function draftInstruction(mode: DraftMode, existing?: string): string {
  const rewriteBase = existing ? `\n\nExisting draft to modify:\n---\n${existing}\n---` : "";
  switch (mode) {
    case "Initial Outreach": return "Write a first-contact email introducing Survival Tabs and offering a free sample pack in exchange for honest feedback. Reference their content niche.";
    case "Follow-up": return `Write a light, no-pressure follow-up to a previous unanswered email.${rewriteBase}`;
    case "Thank You": return "Write a thank-you email after the creator posted content featuring Survival Tabs.";
    case "Shipping": return "Write a short shipping-notification email with tracking placeholder [TRACKING] and expected delivery placeholder [ETA].";
    case "Campaign Invitation": return "Write an invitation to a paid campaign — mention a compensated collaboration and ask for their rate.";
    case "Collaboration Proposal": return "Write a longer collaboration proposal outlining deliverables (1 video + 2 stories) and a paid partnership.";
    case "Rewrite": return `Rewrite this email keeping the same intent but with a fresh angle.${rewriteBase}`;
    case "Shorter": return `Rewrite this email in 60 words or fewer while keeping the ask.${rewriteBase}`;
    case "Friendlier": return `Rewrite this email in a warmer, more casual tone.${rewriteBase}`;
    case "More Professional": return `Rewrite this email in a more formal, business tone.${rewriteBase}`;
  }
}

export const generateEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mode: DraftMode; creatorName: string; creatorHandle?: string; creatorNiche?: string; senderFirstName: string; existingDraft?: string; extraContext?: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const userMsg = [
      `Creator name: ${data.creatorName}`,
      data.creatorHandle ? `Creator handle: ${data.creatorHandle}` : null,
      data.creatorNiche ? `Creator niche: ${data.creatorNiche}` : null,
      `Sender first name: ${data.senderFirstName}`,
      data.extraContext ? `Extra context: ${data.extraContext}` : null,
      "",
      draftInstruction(data.mode, data.existingDraft),
    ].filter(Boolean).join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMsg }] }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI draft failed (${res.status}): ${t.slice(0, 300)}`);
    }
    const payload = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/^Subject:\s*(.+?)\r?\n\r?\n?([\s\S]*)$/);
    if (match) return { subject: match[1].trim(), body: match[2].trim() };
    return { subject: "", body: raw };
  });

interface GmailListMessage { id: string; threadId: string }
interface GmailMessage {
  id: string; threadId: string; snippet?: string; labelIds?: string[]; internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }>; parts?: unknown; body?: { data?: string } };
}

function headerValue(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFromHeader(from: string): { name: string; email: string } {
  const m = from.match(/^(.*?)<(.+?)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ""), email: m[2].trim() };
  return { name: "", email: from.trim() };
}

export const pollGmailForReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!connectionAPIKey) return { polled: false as const, reason: "not_connected", needsReconnect: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state } = await supabaseAdmin.from("gmail_poll_state").select("last_polled_at").eq("user_id", context.userId).maybeSingle();
    const sinceUnix = Math.floor((state?.last_polled_at ? new Date(state.last_polled_at).getTime() : Date.now() - 24 * 3600_000) / 1000);
    const recordPollError = async (status: number, reason: string) => {
      await supabaseAdmin.from("gmail_poll_state").upsert({ user_id: context.userId, last_error_status: status, last_error_reason: reason, last_error_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    };
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const listRes = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID, path: `/gmail/v1/users/me/messages?q=${encodeURIComponent(`after:${sinceUnix} -from:me`)}&maxResults=25` });
    if (!listRes.ok) {
      const text = await listRes.text();
      const reason = parseGmailErrorReason(text);
      await recordPollError(listRes.status, reason);
      return { polled: false as const, reason: `list_failed_${listRes.status}`, status: listRes.status, errorReason: reason, needsReconnect: isReconnectStatus(listRes.status) };
    }
    const listData = await listRes.json() as { messages?: GmailListMessage[] };
    const ids = (listData.messages ?? []).map((m) => m.id);
    const { CREATORS } = await import("./creator-partnerships");
    const emailToCreator = new Map<string, { id: string; name: string }>();
    for (const c of CREATORS) if (c.email) emailToCreator.set(c.email.toLowerCase(), { id: c.id, name: c.name });
    const { data: sentThreads } = await supabaseAdmin.from("gmail_messages").select("gmail_thread_id").eq("user_id", context.userId).eq("direction", "sent");
    const knownThreadIds = new Set((sentThreads ?? []).map((r) => r.gmail_thread_id).filter(Boolean) as string[]);
    let stored = 0;
    let skipped = 0;
    for (const id of ids) {
      const { data: existing } = await supabaseAdmin.from("gmail_messages").select("id").eq("user_id", context.userId).eq("gmail_message_id", id).maybeSingle();
      if (existing) continue;
      const msgRes = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID, path: `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To` });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json() as GmailMessage;
      const from = parseFromHeader(headerValue(msg.payload?.headers, "From"));
      const subject = headerValue(msg.payload?.headers, "Subject");
      const toRaw = headerValue(msg.payload?.headers, "To");
      const creator = emailToCreator.get(from.email.toLowerCase()) ?? null;
      const isKnownThread = msg.threadId ? knownThreadIds.has(msg.threadId) : false;
      if (!creator && !isKnownThread) { skipped += 1; continue; }
      await supabaseAdmin.from("gmail_messages").upsert({ user_id: context.userId, creator_id: creator?.id ?? null, gmail_message_id: msg.id, gmail_thread_id: msg.threadId, direction: "received", from_email: from.email, from_name: from.name || creator?.name || null, to_emails: toRaw ? [toRaw] : [], subject, snippet: msg.snippet ?? null, label_ids: msg.labelIds ?? [], sent_at: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString() }, { onConflict: "user_id,gmail_message_id" });
      stored += 1;
    }
    const now = new Date().toISOString();
    await supabaseAdmin.from("gmail_poll_state").upsert({ user_id: context.userId, last_polled_at: now, last_success_at: now, last_error_status: null, last_error_reason: null, last_error_at: null, updated_at: now }, { onConflict: "user_id" });
    return { polled: true as const, checked: ids.length, stored, skipped, needsReconnect: false };
  });

export const listCreatorMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { creatorId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("gmail_messages").select("id, gmail_message_id, gmail_thread_id, direction, from_email, from_name, to_emails, subject, snippet, sent_at, label_ids").eq("creator_id", data.creatorId).order("sent_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { messages: rows ?? [], viewerId: context.userId };
  });

export const listRecentMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("gmail_messages").select("id, gmail_message_id, creator_id, direction, from_email, from_name, subject, snippet, sent_at, user_id").not("creator_id", "is", null).order("sent_at", { ascending: false }).limit(50);
    return { messages: rows ?? [], viewerId: context.userId };
  });

export const listGmailSendErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("gmail_send_errors").select("id, sender_email, creator_id, creator_name, recipient, action, http_status, error_reason, subject, created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50);
    return { rows: rows ?? [], viewerId: context.userId };
  });

export const purgeTestCreatorArtifacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { creatorId: string }) => {
    if (!input.creatorId.startsWith("TEST-")) throw new Error("Refusing to purge non-test creator id.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: msgCount }, { count: errCount }] = await Promise.all([
      supabaseAdmin.from("gmail_messages").delete({ count: "exact" }).eq("user_id", context.userId).eq("creator_id", data.creatorId),
      supabaseAdmin.from("gmail_send_errors").delete({ count: "exact" }).eq("user_id", context.userId).eq("creator_id", data.creatorId),
    ]);
    return { messagesDeleted: msgCount ?? 0, errorsDeleted: errCount ?? 0 };
  });

export type SaveGmailDraftResult =
  | { ok: true; draftId: string; updatedAt: string }
  | { ok: false; status: number; reason: string; needsReconnect: boolean };

export const saveGmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    creatorId: string;
    to: string;
    subject: string;
    body: string;
    imageUrl?: string | null;
    imageAlt?: string | null;
    cc?: string;
    draftId?: string;
  }) => input)
  .handler(async ({ data, context }): Promise<SaveGmailDraftResult> => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!connectionAPIKey) return { ok: false, status: 0, reason: "Gmail is not connected.", needsReconnect: true };
    const raw = buildRawEmail({ to: data.to, cc: data.cc, subject: data.subject || "(no subject)", body: data.body, imageUrl: data.imageUrl, imageAlt: data.imageAlt });
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const path = data.draftId ? `/gmail/v1/users/me/drafts/${data.draftId}` : `/gmail/v1/users/me/drafts`;
    const method = data.draftId ? "PUT" : "POST";
    const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID, path, init: { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: { raw } }) } });
    if (!res.ok) {
      const text = await res.text();
      const reason = parseGmailErrorReason(text);
      return { ok: false, status: res.status, reason, needsReconnect: isReconnectStatus(res.status) };
    }
    const j = await res.json() as { id: string };
    return { ok: true, draftId: j.id, updatedAt: new Date().toISOString() };
  });
