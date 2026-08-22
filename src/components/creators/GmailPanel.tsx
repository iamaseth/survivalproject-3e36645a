// Real Gmail composer, approved templates, and cached conversation history for a creator.
// Uses the signed-in user's Gmail via the App User Connector.
//
// Test Mode safety net:
//   - Sending to a REAL creator record is blocked while Test Mode is on.
//   - Sending from a TEST creator record redirects the recipient to
//     TEST_RECIPIENT_EMAIL (thenxyz@gmail.com) and requires an explicit
//     final confirmation dialog.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, MailCheck, Send, RefreshCw, AlertCircle, MailX, ShieldAlert, Beaker, XCircle, Save, Pencil, FileText, ChevronDown, CheckCircle2, Image as ImageIcon } from "lucide-react";
import type { CreatorRow } from "@/lib/creator-partnerships";
import {
  useWorkspace,
  updateWorkspace,
  logConfirmedGmailSend,
  isTestCreatorId,
  effectiveEmail,
} from "@/lib/creator-workspace";
import { computeStage } from "@/lib/creator-workflow";
import { useAuth } from "@/lib/current-user";
import { useTestMode } from "@/lib/test-mode";
import { TEST_RECIPIENT_EMAIL } from "@/lib/test-creators";
import {
  getGmailConnectionStatus,
  sendGmailToCreator,
  listCreatorMessages,
  pollGmailForReplies,
  saveGmailDraft,
  type DraftMode,
} from "@/lib/gmail.functions";
import { listEmailTemplates } from "@/lib/templates.functions";
import { applyMergeFields, mergeContextForCreator, orderTemplatesForCreator, type EmailTemplate } from "@/lib/templates";

type Msg = {
  id: string; gmail_message_id: string; gmail_thread_id: string | null;
  direction: string; from_email: string | null; from_name: string | null;
  to_emails: string[]; subject: string | null; snippet: string | null;
  sent_at: string | null; label_ids: string[];
};

type ConnStatus =
  | { kind: "loading" }
  | { kind: "disconnected" }
  | { kind: "connected"; needsReconnect: boolean; email: string | null; lastErrorReason: string | null; lastErrorStatus: number | null };

export function GmailPanel({ c }: { c: CreatorRow; initialMode?: DraftMode }) {
  const auth = useAuth();
  const ws = useWorkspace(c);
  const stage = computeStage(c, ws);
  const testMode = useTestMode();
  const isTestCreator = isTestCreatorId(c.id, c.name);

  const status = useServerFn(getGmailConnectionStatus);
  const send = useServerFn(sendGmailToCreator);
  const list = useServerFn(listCreatorMessages);
  const poll = useServerFn(pollGmailForReplies);
  const saveDraftFn = useServerFn(saveGmailDraft);

  const [conn, setConn] = useState<ConnStatus>({ kind: "loading" });
  const savedEmail = effectiveEmail(c, ws);
  const [to, setTo] = useState<string>(savedEmail ?? "");
  const [editingTo, setEditingTo] = useState<boolean>(!savedEmail);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateImageUrl, setTemplateImageUrl] = useState<string | null>(null);
  const [templateImageAlt, setTemplateImageAlt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveDraftErr, setSaveDraftErr] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);

  useEffect(() => {
    const d = ws.savedGmailDraft;
    if (d) {
      setSubject((prev) => prev || d.subject);
      setBody((prev) => prev || d.body);
      if (d.to) setTo((prev) => prev || d.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);

  const refresh = useCallback(async () => {
    const [s, r] = await Promise.all([status(), list({ data: { creatorId: c.id } })]);
    if (!s.connected) setConn({ kind: "disconnected" });
    else setConn({
      kind: "connected",
      needsReconnect: s.needsReconnect,
      email: s.emailAddress,
      lastErrorReason: s.lastErrorReason ?? null,
      lastErrorStatus: s.lastErrorStatus ?? null,
    });
    setMsgs(r.messages as Msg[]);
    setLoading(false);
  }, [c.id, list, status]);

  useEffect(() => { refresh(); }, [refresh]);

  const blockedByTestMode = testMode.enabled && !isTestCreator;
  const actualRecipient = testMode.enabled ? TEST_RECIPIENT_EMAIL : (to.trim() || null);
  const senderEmail = conn.kind === "connected" ? conn.email : null;

  const saveInlineEmail = () => {
    const v = to.trim();
    updateWorkspace(c.id, { emailOverride: v || null });
    setEditingTo(false);
  };

  const onSaveDraft = async () => {
    setSaveDraftErr(null);
    if (!to.trim() || !body.trim()) {
      const m = "Add a recipient and body before saving a draft.";
      setSaveDraftErr(m); toast.error(m); return;
    }
    setSavingDraft(true);
    try {
      const r = await saveDraftFn({
        data: {
          creatorId: c.id,
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          imageUrl: templateImageUrl,
          imageAlt: templateImageAlt,
          draftId: ws.savedGmailDraft?.draftId,
        },
      });
      if (!r.ok) {
        const m = r.needsReconnect
          ? `Gmail rejected the draft (${r.status}). Reconnect Gmail to fix. ${r.reason}`
          : `Save draft failed (${r.status}): ${r.reason}`;
        setSaveDraftErr(m); toast.error("Save draft failed", { description: m });
        return;
      }
      updateWorkspace(c.id, {
        emailDraftCreated: true,
        savedGmailDraft: {
          draftId: r.draftId,
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          updatedAt: r.updatedAt,
        },
      });
      toast.success("Draft saved to Gmail", {
        description: `Resumable from any device · ${new Date(r.updatedAt).toLocaleTimeString()}`,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setSaveDraftErr(m); toast.error("Save draft failed", { description: m });
    } finally { setSavingDraft(false); }
  };

  const validateBeforeSend = (): string | null => {
    if (blockedByTestMode) return "Test Mode is ON — direct sending from a real creator record is disabled.";
    if (!actualRecipient) return "Add a recipient email in the To field before sending.";
    if (!subject.trim() || !body.trim()) return "Subject and body are required.";
    return null;
  };

  const onClickSend = () => {
    setErr(null);
    const v = validateBeforeSend();
    if (v) { setErr(v); toast.error(v); return; }
    setShowConfirm(true);
  };

  const doSend = async () => {
    setShowConfirm(false);
    if (!actualRecipient) return;
    setErr(null); setSending(true);
    const stageLabel = labelHint(stage);
    try {
      const res = await send({
        data: {
          creatorId: c.id,
          creatorEmail: actualRecipient,
          creatorName: testMode.enabled ? `TEST (was: ${c.name})` : c.name,
          subject: subject.trim(),
          body: testMode.enabled
            ? `[TEST MODE — session ${testMode.sessionId ?? "?"}]\nOriginal intended recipient: ${to.trim() || "(none on file)"}\nActual recipient: ${TEST_RECIPIENT_EMAIL}\n\n${body.trim()}`
            : body.trim(),
          imageUrl: templateImageUrl,
          imageAlt: templateImageAlt,
          stage,
        },
      });
      if (!res.ok) {
        const summary = res.needsReconnect
          ? `Gmail rejected the send (${res.status}). Reconnect Gmail to fix.`
          : `Gmail send failed (${res.status}).`;
        setErr(`${summary} ${res.reason}`);
        toast.error("Send failed", { description: `${summary} ${res.reason}` });
        await refresh();
        return;
      }
      logConfirmedGmailSend(c, {
        messageId: res.messageId,
        threadId: res.threadId,
        subject: subject.trim(),
        stageLabel,
        actor: (auth.status === "authenticated" && auth.profile.teamId) ? auth.profile.teamId : undefined,
      });
      if (ws.savedGmailDraft) updateWorkspace(c.id, { savedGmailDraft: null });
      toast.success(testMode.enabled ? "Test email sent" : "Email sent", {
        description: `To ${actualRecipient}${testMode.enabled ? " (Test Mode redirect)" : ""} · Gmail id ${res.messageId.slice(0, 8)}…`,
      });
      setSubject(""); setBody(""); setTemplateImageUrl(null); setTemplateImageAlt(null);
      await refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(m); toast.error("Send failed", { description: m });
    } finally { setSending(false); }
  };

  const onCheckReplies = async () => {
    setPollErr(null);
    try {
      const r = await poll();
      if ("polled" in r && !r.polled) {
        const reason = ("errorReason" in r ? r.errorReason : undefined) ?? r.reason;
        setPollErr(`Gmail reply check failed (${"status" in r ? r.status : "?"}): ${reason}`);
        toast.error("Reply sync failed", { description: reason });
      } else if (r.polled) {
        toast.success(`Checked Gmail`, { description: `${r.stored} new message${r.stored === 1 ? "" : "s"} stored` });
      }
      await refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setPollErr(m); toast.error("Reply sync failed", { description: m });
    }
  };

  const isConnected = conn.kind === "connected";
  const needsReconnect = conn.kind === "connected" && conn.needsReconnect;
  const draftMeta = ws.savedGmailDraft;

  return (
    <div className="space-y-6">
      {conn.kind === "disconnected" ? <ConnectBanner /> : needsReconnect ? <ReconnectBanner reason={conn.lastErrorReason} status={conn.lastErrorStatus} /> : null}
      {testMode.enabled ? <TestModeSendBanner blocked={blockedByTestMode} isTestCreator={isTestCreator} creatorEmail={savedEmail} /> : null}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Send via your Gmail</div>
            <h3 className="font-display text-base">Compose email to {c.name}{isTestCreator ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">Test</span> : null}</h3>
            {draftMeta ? <div className="mt-0.5 text-[11px] text-muted-foreground">Draft resumed from Gmail · updated {new Date(draftMeta.updatedAt).toLocaleString()}</div> : null}
          </div>
          {isConnected && !needsReconnect ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"><MailCheck className="h-3 w-3" /> Gmail connected</span> : null}
        </div>

        <div className="mb-2 grid grid-cols-[60px_1fr] items-center gap-2">
          <label className="text-xs text-muted-foreground">To</label>
          <div className="flex items-center gap-2">
            <input value={to} onChange={(e) => setTo(e.target.value)} onBlur={saveInlineEmail} readOnly={!editingTo} placeholder={savedEmail ? "" : "No email on file — add one here"} className={`w-full rounded-md border px-2 py-1.5 font-mono text-xs focus:border-ring focus:ring-2 focus:ring-ring/30 ${editingTo ? "border-input bg-background" : "border-input bg-secondary/40"} ${!to && !editingTo ? "text-red-700 placeholder:text-red-600" : ""}`} />
            {!editingTo ? <button type="button" onClick={() => setEditingTo(true)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] hover:bg-secondary"><Pencil className="h-3 w-3" /> Edit</button> : <button type="button" onClick={saveInlineEmail} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">Save</button>}
          </div>
        </div>
        {testMode.enabled && to ? <div className="mb-2 grid grid-cols-[60px_1fr] items-center gap-2"><span /><span className="text-[11px]"><span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">Test Mode → will be sent to {TEST_RECIPIENT_EMAIL}</span></span></div> : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <TemplatePicker
            creator={c}
            senderFullName={auth.status === "authenticated" ? auth.profile.fullName : null}
            currentBodyIsEmpty={!body.trim() && !subject.trim()}
            onApply={(subj, bod, imageUrl, imageAlt) => {
              setSubject(subj); setBody(bod); setTemplateImageUrl(imageUrl); setTemplateImageAlt(imageAlt);
            }}
          />
          <button onClick={onSaveDraft} disabled={savingDraft || !isConnected || needsReconnect || !to.trim() || !body.trim()} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60">
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{draftMeta ? "Update Gmail draft" : "Save as Gmail draft"}
          </button>
          <span className="text-[11px] text-muted-foreground">Approved templates use no Lovable AI credits.</span>
        </div>
        {saveDraftErr ? <div className="mb-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{saveDraftErr}</span></div> : null}

        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/30" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your email or apply an approved template above." rows={12} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:border-ring focus:ring-2 focus:ring-ring/30" />

        {templateImageUrl ? (
          <div className="mt-3 rounded-md border border-border bg-secondary/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium"><ImageIcon className="h-3.5 w-3.5" /> Template photo</div>
              <button type="button" onClick={() => { setTemplateImageUrl(null); setTemplateImageAlt(null); }} className="text-xs text-muted-foreground underline">Remove from this email</button>
            </div>
            <img src={templateImageUrl} alt={templateImageAlt || "Survival Tabs product image"} className="max-h-56 max-w-full rounded border border-border object-contain bg-background" />
            <div className="mt-1 text-[10px] text-muted-foreground">{templateImageAlt || "Survival Tabs product image"}</div>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground">On confirmed send: applies Gmail label <span className="font-medium">{labelHint(stage)}</span>, updates workflow, logs to timeline.</div>
          <button onClick={onClickSend} disabled={sending || !isConnected || needsReconnect || blockedByTestMode || !actualRecipient || !subject.trim() || !body.trim()} className="inline-flex items-center gap-2 rounded-md bg-[color:var(--forest)] px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{testMode.enabled ? "Review & send (Test)" : "Send from my Gmail"}
          </button>
        </div>
        {err ? <div className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{err}</span></div> : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div><div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Conversation history</div><h3 className="font-display text-base">Gmail thread with {c.name}</h3></div>
          <button onClick={onCheckReplies} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-secondary"><RefreshCw className="h-3.5 w-3.5" /> Check for replies</button>
        </div>
        {pollErr ? <div className="mb-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{pollErr}</span></div> : null}
        {loading ? <div className="grid place-items-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> : msgs.length === 0 ? <div className="rounded-md border border-dashed border-border py-8 text-center text-xs text-muted-foreground">No emails yet with {c.name}. Send one above — it'll appear here and in your Gmail Sent folder.</div> : (
          <ul className="divide-y divide-border">
            {msgs.map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-3">
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${m.direction === "sent" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{m.direction === "sent" ? <MailCheck className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium">{m.direction === "sent" ? `You → ${c.name}` : `${m.from_name ?? m.from_email ?? c.name} → you`}</span><span className="shrink-0 text-muted-foreground">{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</span></div>
                  <div className="mt-0.5 truncate text-sm font-medium">{m.subject ?? "(no subject)"}</div><div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.snippet ?? ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showConfirm ? <ConfirmSendDialog testMode={testMode.enabled} originalRecipient={to.trim() || null} actualRecipient={actualRecipient!} subject={subject.trim()} senderEmail={senderEmail} hasImage={Boolean(templateImageUrl)} onCancel={() => setShowConfirm(false)} onConfirm={doSend} /> : null}
    </div>
  );
}

function ConnectBanner() {
  return <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-2 text-sm text-amber-900"><MailX className="mt-0.5 h-4 w-4" /><div><div className="font-medium">Gmail isn't connected.</div><div className="text-xs">Connect your Gmail in Settings to send outreach and sync replies.</div></div></div><Link to="/settings" className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">Connect Gmail</Link></div>;
}

function ReconnectBanner({ reason, status }: { reason: string | null; status: number | null }) {
  return <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4"><div className="flex items-start gap-2 text-sm text-red-900"><ShieldAlert className="mt-0.5 h-4 w-4" /><div><div className="font-medium">Gmail connection needs attention.</div><div className="text-xs">Reconnect Gmail to restore sending and reply syncing.</div>{reason ? <div className="mt-1 text-[11px] text-red-700">Last error {status ?? ""}: {reason}</div> : null}</div></div><Link to="/settings" className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Reconnect Gmail</Link></div>;
}

function TestModeSendBanner({ blocked, isTestCreator, creatorEmail }: { blocked: boolean; isTestCreator: boolean; creatorEmail: string | null }) {
  if (blocked) return <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium">Direct-send blocked by Test Mode.</div><div className="text-xs">Test Mode is on. Sending from a real creator record is disabled to protect {creatorEmail ? <><span className="font-mono">{creatorEmail}</span> </> : " real recipients "}from test traffic.</div></div></div>;
  if (isTestCreator) return <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><Beaker className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium">TEST MODE: This message will be sent only to {TEST_RECIPIENT_EMAIL}.</div><div className="text-xs">The creator record's email is ignored while Test Mode is on.</div></div></div>;
  return null;
}

function ConfirmSendDialog({ testMode, originalRecipient, actualRecipient, subject, senderEmail, hasImage, onCancel, onConfirm }: {
  testMode: boolean; originalRecipient: string | null; actualRecipient: string; subject: string; senderEmail: string | null; hasImage: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
      <div className="mb-3 flex items-center gap-2">{testMode ? <Beaker className="h-4 w-4 text-amber-700" /> : <Send className="h-4 w-4" />}<h3 className="font-display text-lg">{testMode ? "Confirm test send" : "Confirm send"}</h3></div>
      {testMode ? <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900">TEST MODE: This message will be sent only to {TEST_RECIPIENT_EMAIL}.</div> : null}
      <dl className="space-y-2 text-sm"><Field label="Composed recipient" value={originalRecipient ?? "— none —"} /><Field label="Actual recipient" value={actualRecipient} highlight={testMode && actualRecipient !== originalRecipient} /><Field label="Subject" value={subject} /><Field label="Template photo" value={hasImage ? "Included" : "None"} /><Field label="Sending Gmail account" value={senderEmail ?? "your connected Gmail account"} /></dl>
      <div className="mt-5 flex items-center justify-end gap-2"><button onClick={onCancel} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary">Cancel</button><button onClick={onConfirm} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white ${testMode ? "bg-amber-600 hover:bg-amber-700" : "bg-[color:var(--forest)] hover:opacity-95"}`}><Send className="h-4 w-4" />{testMode ? `Send test email to ${TEST_RECIPIENT_EMAIL}` : "Send now"}</button></div>
    </div></div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className="flex items-start justify-between gap-3"><dt className="min-w-[160px] text-xs uppercase tracking-wider text-muted-foreground">{label}</dt><dd className={`break-all text-right text-sm ${highlight ? "font-semibold text-amber-800" : "text-foreground"}`}>{value}</dd></div>;
}

function labelHint(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("complete") || s.includes("partnership")) return "Completed";
  if (s.includes("campaign") || s.includes("negotiat")) return "Campaign";
  if (s.includes("waiting") || s.includes("follow")) return "Waiting Reply";
  if (s.includes("outreach") || s.includes("contact") || s.includes("sent")) return "Outreach";
  return "Creator Partnerships";
}

function TemplatePicker({ creator, senderFullName, currentBodyIsEmpty, onApply }: {
  creator: CreatorRow;
  senderFullName: string | null;
  currentBodyIsEmpty: boolean;
  onApply: (subject: string, body: string, imageUrl: string | null, imageAlt: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const list = useServerFn(listEmailTemplates);
  const q = useQuery({ queryKey: ["email-templates", "active"], queryFn: () => list({ data: { activeOnly: true } }), enabled: open });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const ordered = useMemo(() => {
    const items: EmailTemplate[] = q.data?.templates ?? [];
    return orderTemplatesForCreator(items, creator.segment);
  }, [q.data, creator.segment]);
  const ctx = useMemo(() => mergeContextForCreator(creator, senderFullName), [creator, senderFullName]);

  const applyTemplate = (t: EmailTemplate) => {
    if (!currentBodyIsEmpty) {
      const ok = confirm(`Replace the current subject, body and template photo with the "${t.name}" template?`);
      if (!ok) return;
    }
    onApply(applyMergeFields(t.subject, ctx), applyMergeFields(t.body, ctx), t.imageUrl, t.imageAlt);
    setOpen(false);
    toast.success("Template applied", { description: t.imageUrl ? `${t.name} · photo included` : t.name });
  };

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-secondary"><FileText className="h-4 w-4" /> Use approved template<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></button>
      {open ? <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border border-border bg-card shadow-lg">
        <div className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Approved templates</div>
        {q.isLoading ? <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div> : q.error ? <div className="px-3 py-4 text-xs text-red-700">Failed to load templates.</div> : ordered.length === 0 ? <div className="px-3 py-4 text-xs text-muted-foreground">No approved templates yet. <Link to="/templates" className="text-primary underline" onClick={() => setOpen(false)}>Create one</Link> in Templates.</div> : (
          <ul className="max-h-72 overflow-auto py-1">
            {ordered.map((t) => {
              const segLabel = t.segment || "General";
              const matchesSegment = creator.segment && t.segment && creator.segment.trim().toLowerCase() === t.segment.trim().toLowerCase();
              return <li key={t.id}><button type="button" onClick={() => applyTemplate(t)} className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-secondary/60"><div className="flex min-w-0 items-start gap-2">{t.imageUrl ? <img src={t.imageUrl} alt={t.imageAlt || "Template image"} className="h-9 w-9 shrink-0 rounded border border-border object-cover" /> : null}<div className="min-w-0"><div className="truncate text-sm font-medium">{t.name}</div><div className="truncate text-[11px] text-muted-foreground">{t.subject || "(no subject)"}</div></div></div><div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${matchesSegment ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground"}`}>{segLabel}</span><CheckCircle2 className="h-3 w-3 text-emerald-600" /></div></button></li>;
            })}
          </ul>
        )}
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">Merge fields substituted for {creator.name}. No AI call.</div>
      </div> : null}
    </div>
  );
}
