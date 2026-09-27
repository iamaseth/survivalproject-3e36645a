import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Mail, CheckCircle2, XCircle, Loader2, LogOut,
  ShieldAlert, Trash2, Beaker, Download, History, AlertTriangle, Info,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ImportProspectsSection } from "@/components/settings/ImportProspectsSection";
import { ImportCreatorsSection } from "@/components/settings/ImportCreatorsSection";
import { WorkspaceMigrationConflictsBanner } from "@/components/settings/WorkspaceMigrationConflictsBanner";
import { useAuth } from "@/lib/current-user";
import { connectAppUser, type AppUserOAuthTraceEvent } from "@/integrations/lovable/appUserConnectorClient";
import {
  getGmailConnectionStatus, startGmailConnect, saveGmailConnection, disconnectGmail,
} from "@/lib/gmail.functions";
import {
  getResetPreview, runReset, listAuditLog, recordTestModeEvent,
  type ResetScope,
} from "@/lib/admin-reset.functions";
import {
  clearAllWorkspace, clearTestActivities, clearWorkspaceForIds,
  exportWorkspaceSnapshot, isTestCreatorId, workspaceActivityCounts, workspaceOverrideCount,
  previewReconcileWaitingForReply, reconcileWaitingForReply,
} from "@/lib/creator-workspace";
import { listGmailSendErrors, getGmailConnectionStatus as getGmailStatus, purgeTestCreatorArtifacts } from "@/lib/gmail.functions";
import { CREATORS } from "@/lib/creator-partnerships";
import { enableTestMode, disableTestMode, useTestMode } from "@/lib/test-mode";
import {
  createTestCreator, deleteTestCreator, useTestCreators, TEST_RECIPIENT_EMAIL,
} from "@/lib/test-creators";
import { Link as RouterLink } from "@tanstack/react-router";
import { toast } from "sonner";
import { exportPortableBackup } from "@/lib/portable-backup.functions";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Survival Tabs Team Hub" },
      { name: "description", content: "Connect Gmail, manage test data, and control workspace preferences." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const auth = useAuth();
  const isExecutive = auth.status === "authenticated" && auth.profile.role === "executive";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Your workspace" description="Personal integrations, admin tools, and preferences." />
      <WorkspaceMigrationConflictsBanner />
      <GmailSection />
      <ProfileSection />
      <ImportProspectsSection />
      <ImportCreatorsSection />
      <TestModeSection />
      {isExecutive ? <PortableBackupSection /> : null}
      {isExecutive ? <DataManagementSection /> : <NonAdminDataManagementNote />}
    </div>
  );
}

/* ---------------- Gmail ---------------- */
function GmailSection() {
  const status = useServerFn(getGmailConnectionStatus);
  const start = useServerFn(startGmailConnect);
  const save = useServerFn(saveGmailConnection);
  const disconnect = useServerFn(disconnectGmail);

  const [connState, setConnState] = useState<
    | { kind: "loading" }
    | { kind: "disconnected" }
    | { kind: "connected"; email: string | null; lastPolledAt: string | null; needsReconnect: boolean; lastErrorStatus: number | null; lastErrorReason: string | null }
  >({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [oauthTrace, setOauthTrace] = useState<AppUserOAuthTraceEvent[]>([]);

  const refresh = useCallback(async () => {
    try {
      const s = await status();
      if (s.connected) setConnState({
        kind: "connected",
        email: s.emailAddress,
        lastPolledAt: s.lastPolledAt,
        needsReconnect: !!s.needsReconnect,
        lastErrorStatus: s.lastErrorStatus ?? null,
        lastErrorReason: s.lastErrorReason ?? null,
      });
      else setConnState({ kind: "disconnected" });
    } catch (e) {
      setConnState({ kind: "disconnected" });
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [status]);

  useEffect(() => { refresh(); }, [refresh]);

  const onConnect = async () => {
    setOauthTrace([]);
    setBusy(true); setMsg(null);
    try {
      const result = await connectAppUser({
        connectorId: "google_mail",
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: (targetOrigin) => start({ data: { targetOrigin } }),
        onTrace: (event) => setOauthTrace((current) => [...current, event]),
      });
      if (!result.success) { setMsg(result.error ?? "Connection failed"); return; }
      if (!result.connectionAPIKey) { setMsg("Offline access disabled — cannot store connection."); return; }
      const r = await save({ data: { connectionAPIKey: result.connectionAPIKey } });
      setMsg(`Gmail connected as ${r.emailAddress ?? "your account"}.`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect your Gmail from Survival Tabs Hub?")) return;
    setBusy(true); setMsg(null);
    try { await disconnect(); setMsg("Gmail disconnected."); await refresh(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary">
          <Mail className="h-6 w-6 text-[color:var(--forest)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg">Gmail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your Gmail so outreach is sent from your own inbox, replies land in the creator timeline
            automatically, and Gmail labels are applied for you.
          </p>
          {connState.kind === "loading" ? (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
            </div>
          ) : connState.kind === "connected" ? (
            <div className="mt-4 space-y-2">
              <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Connected{connState.email ? ` as ${connState.email}` : ""}
              </div>
              {connState.needsReconnect ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <div className="flex items-center gap-1.5 font-medium"><ShieldAlert className="h-3.5 w-3.5" /> Reconnect required</div>
                  <div className="mt-1">Gmail returned {connState.lastErrorStatus ?? "an error"}: {connState.lastErrorReason ?? "authorization failed"}. Sending and reply syncing are paused until you reconnect.</div>
                  <button
                    onClick={onConnect}
                    disabled={busy}
                    className="mt-2 inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Reconnect Gmail
                  </button>
                </div>
              ) : null}
              {connState.lastPolledAt ? (
                <div className="text-xs text-muted-foreground">
                  Last checked for replies: {new Date(connState.lastPolledAt).toLocaleString()}
                </div>
              ) : null}
              <button
                onClick={onDisconnect}
                disabled={busy}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" /> Disconnect Gmail
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                <XCircle className="h-4 w-4" /> Not connected
              </div>
              <div className="mt-3">
                <button
                  onClick={onConnect}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-[color:var(--forest)] px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Connect my Gmail
                </button>
              </div>
            </div>
          )}
          {msg ? <p className="mt-3 text-xs text-muted-foreground">{msg}</p> : null}
          {oauthTrace.length > 0 ? <OAuthTracePanel events={oauthTrace} /> : null}
        </div>
      </div>
    </section>
  );
}

function OAuthTracePanel({ events }: { events: AppUserOAuthTraceEvent[] }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gmail OAuth trace</div>
      <div className="mt-2 space-y-2">
        {events.map((event, index) => (
          <div key={`${event.step}-${index}`} className="rounded-md bg-secondary/60 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div className="font-semibold text-foreground">{index + 1}. {event.step}</div>
            <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(stripTraceEvent(event), null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function stripTraceEvent(event: AppUserOAuthTraceEvent) {
  const { step, at, ...details } = event;
  return { at, ...details };
}

function ProfileSection() {
  const auth = useAuth();
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-display text-lg">Profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">Managed via Google sign-in.</p>
      {auth.status === "authenticated" ? (
        <div className="mt-3 text-sm">
          <div><span className="text-muted-foreground">Name:</span> {auth.profile.fullName}</div>
          <div><span className="text-muted-foreground">Email:</span> {auth.profile.email}</div>
          <div><span className="text-muted-foreground">Role:</span> {auth.profile.roleLabel}</div>
        </div>
      ) : null}
    </section>
  );
}

/* ---------------- Portable backup ---------------- */
function PortableBackupSection() {
  const exportBackup = useServerFn(exportPortableBackup);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const backup = await exportBackup();
      const text = JSON.stringify(backup, null, 2);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const a = document.createElement("a");
      a.href = url;
      a.download = `survival-influencer-full-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast.success("Full backup downloaded to this computer.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary">
          <Download className="h-6 w-6 text-[color:var(--forest)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg">Backup to disk</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Download a dated portable backup of the app database to this computer. Creator records,
            research, outreach state, templates, campaigns, BoBo progress and other operational data are included.
            OAuth connection credentials and security tokens are intentionally excluded.
          </p>
          <button
            onClick={() => void download()}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-[color:var(--forest)] px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? "Preparing backup…" : "Download full backup"}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">Keep this file somewhere safe. No live data is changed by downloading a backup.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Test Mode toggle ---------------- */
function TestModeSection() {
  const tm = useTestMode();
  const record = useServerFn(recordTestModeEvent);
  const [busy, setBusy] = useState(false);

  const onToggle = async () => {
    setBusy(true);
    try {
      if (tm.enabled) {
        const prev = tm.sessionId;
        disableTestMode();
        void record({ data: { enabled: false, sessionId: prev } }).catch(() => {});
      } else {
        const next = enableTestMode();
        void record({ data: { enabled: true, sessionId: next.sessionId } }).catch(() => {});
      }
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary">
          <Beaker className="h-6 w-6 text-[color:var(--forest)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg">Test Mode</h2>
            {tm.enabled ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-900">On</span>
            ) : (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Off</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            When Test Mode is on, every activity entry, workflow change, draft, and email created gets tagged with a session id.
            A banner appears at the top of the app so nobody mistakes test data for real work, and any test-tagged rows can be
            wiped later without touching real data.
          </p>
          {tm.enabled ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Active session <span className="font-mono">{tm.sessionId}</span>
              {tm.startedAt ? <> · started {new Date(tm.startedAt).toLocaleString()}</> : null}
            </div>
          ) : null}
          <button
            onClick={onToggle}
            disabled={busy}
            className={`mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              tm.enabled
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "bg-[color:var(--forest)] text-white hover:opacity-95"
            }`}
          >
            {tm.enabled ? "Turn Test Mode off" : "Turn Test Mode on"}
          </button>
        </div>
      </div>
    </section>
  );
}

function NonAdminDataManagementNote() {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-display text-lg">Data Management</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Restricted to Executive Admins. Ask Perry to run a Test Data Reset if you need one.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Data Management (Exec only) ---------------- */
type Phase =
  | { step: "idle" }
  | { step: "review"; scope: ResetScope }
  | { step: "confirm"; scope: ResetScope; typed: string }
  | { step: "running"; scope: ResetScope }
  | { step: "done"; scope: ResetScope; affected: Record<string, number> }
  | { step: "error"; scope: ResetScope; message: string };

const SCOPE_TITLE: Record<ResetScope, string> = {
  test_activity: "Reset Test Activity Only",
  test_creators: "Delete Test Creators Only",
  full: "Full Operational Reset",
};

const SCOPE_DESC: Record<ResetScope, string> = {
  test_activity:
    "Recommended. Wipes the cached Gmail messages, poll checkpoints, workflow overrides, activity timelines, and drafts created during testing. Every creator's operational fields (outreach status, follow-up dates, shipping, workflow stage, relationship health) fall back to the values originally imported from the spreadsheet.",
  test_creators:
    "Removes only creator entries whose id starts with \"TEST-\" or whose name begins with \"TEST –\". Real imported creators are never touched. All Gmail cache, workflow, notes, and communication records for those test creators are also removed.",
  full:
    "Strongest reset. Clears every operational workspace override for every creator, wipes all cached Gmail messages and poll checkpoints, and resets dashboard metrics. The imported creator directory, research notes, ownership on the sheet, roles, Google authentication, Gmail connections, and Knowledge Center content are preserved. Requires typing the confirmation phrase.",
};

function DataManagementSection() {
  const preview = useServerFn(getResetPreview);
  const runResetFn = useServerFn(runReset);
  const audit = useServerFn(listAuditLog);
  const tm = useTestMode();

  const [dbCounts, setDbCounts] = useState<{ gmailMessages: number; gmailPollStates: number; gmailConnections: number; auditRows: number } | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  type AuditRow = {
    id: string; actor_name: string | null; actor_email: string | null; actor_role: string | null;
    action: string; reset_type: string | null; affected_records: unknown;
    notes: string | null; created_at: string;
  };
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([preview(), audit()]);
      setDbCounts(p);
      setAuditRows(a.rows as AuditRow[]);
    } catch { /* ignore — likely permission denied on non-exec */ }
  }, [preview, audit]);

  useEffect(() => { refresh(); }, [refresh]);

  const overlayRows = workspaceOverrideCount();
  const activityCounts = workspaceActivityCounts(tm.sessionId);
  const testCreators = useMemo(
    () => CREATORS.filter((c) => isTestCreatorId(c.id, c.name)),
    [],
  );

  function downloadBackup(scope: ResetScope): { fileName: string; sizeBytes: number } {
    const snapshot = {
      generatedAt: new Date().toISOString(),
      scope,
      testMode: tm,
      dbCounts,
      workspaceOverrides: exportWorkspaceSnapshot(),
    };
    const text = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const fileName = `survival-tabs-backup-${scope}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
    const a = document.createElement("a");
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
    return { fileName, sizeBytes: new Blob([text]).size };
  }

  async function executeReset(scope: ResetScope) {
    setPhase({ step: "running", scope });
    try {
      const backup = downloadBackup(scope);
      const testIds = scope === "test_creators" ? testCreators.map((c) => c.id) : undefined;
      const overlayRowsAffected =
        scope === "test_creators" ? testIds!.filter((id) => overlayRows > 0).length
        : scope === "test_activity" ? activityCounts.test
        : overlayRows;

      // Server: gmail_messages / poll_state / audit log
      const res = await runResetFn({
        data: { scope, testCreatorIds: testIds, overlayRowsAffected, backupSummary: backup },
      });

      // Client-side localStorage cleanup
      if (scope === "test_activity") {
        // Only nuke test-tagged activities. Real work stays.
        clearTestActivities(tm.sessionId);
      } else if (scope === "test_creators") {
        clearWorkspaceForIds(testIds!);
      } else if (scope === "full") {
        clearAllWorkspace();
      }

      setPhase({ step: "done", scope, affected: res.affected });
      await refresh();
    } catch (e) {
      setPhase({ step: "error", scope, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-amber-50">
          <ShieldAlert className="h-6 w-6 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg">Data Management</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-900">Executive Admin</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Safely remove data generated during testing and return the operational workflow to a clean starting state.
            Nothing here deletes the imported creator database, authentication, roles, Gmail OAuth client, or team configuration.
          </p>

          {/* Live counts */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <CountTile label="Workspace overrides" value={overlayRows} sub="localStorage" />
            <CountTile label="Cached Gmail messages" value={dbCounts?.gmailMessages ?? "…"} sub="database" />
            <CountTile label="Gmail poll checkpoints" value={dbCounts?.gmailPollStates ?? "…"} sub="database" />
            <CountTile label="Test-tagged activities" value={activityCounts.test} sub={`of ${activityCounts.total} total`} />
          </div>

          {/* Gmail warning */}
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Emails already sent through Gmail cannot be removed from the recipient's inbox.
              Resetting removes only the CRM copy and test workflow data. Gmail account connections are preserved
              — you stay signed in and don't need to reconnect.
            </div>
          </div>

          <GmailOpsSubsection />

          <TestCreatorSubsection />




          {/* Options */}
          <div className="mt-5 space-y-3">
            <ResetOptionCard
              scope="test_activity"
              onPreview={() => setPhase({ step: "review", scope: "test_activity" })}
              recommended
            />
            <ResetOptionCard
              scope="test_creators"
              onPreview={() => setPhase({ step: "review", scope: "test_creators" })}
              extra={`${testCreators.length} test creator${testCreators.length === 1 ? "" : "s"} currently match this filter.`}
            />
            <ResetOptionCard
              scope="full"
              onPreview={() => setPhase({ step: "review", scope: "full" })}
              danger
            />
          </div>

          {/* Confirm flow */}
          {phase.step !== "idle" ? (
            <ConfirmPanel
              phase={phase}
              onClose={() => setPhase({ step: "idle" })}
              onProceed={(scope) => setPhase({ step: "confirm", scope, typed: "" })}
              onTypeChange={(scope, v) => setPhase({ step: "confirm", scope, typed: v })}
              onConfirm={(scope) => executeReset(scope)}
              testCreatorCount={testCreators.length}
              overlayRows={overlayRows}
              activityCounts={activityCounts}
              dbCounts={dbCounts}
            />
          ) : null}

          {/* Audit log */}
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <History className="h-4 w-4" /> Admin audit log
              <span className="text-xs font-normal text-muted-foreground">
                ({auditRows.length === 50 ? "50+" : auditRows.length} recent events)
              </span>
            </div>
            {auditRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
                No admin actions recorded yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Who</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Affected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div>{r.actor_name ?? r.actor_email ?? "—"}</div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.actor_role ?? ""}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.action}</div>
                          {r.reset_type ? <div className="text-[10px] text-muted-foreground">{r.reset_type}</div> : null}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                          {Object.entries((r.affected_records as Record<string, unknown>) || {})
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CountTile({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-2xl leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function ResetOptionCard({
  scope, onPreview, recommended, danger, extra,
}: {
  scope: ResetScope;
  onPreview: () => void;
  recommended?: boolean;
  danger?: boolean;
  extra?: string;
}) {
  return (
    <div className={`rounded-md border p-4 ${danger ? "border-red-200 bg-red-50/40" : "border-border bg-background"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{SCOPE_TITLE[scope]}</h3>
            {recommended ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">Recommended</span> : null}
            {danger ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-800">Requires typed confirmation</span> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{SCOPE_DESC[scope]}</p>
          {extra ? <p className="mt-1 text-[11px] text-muted-foreground">{extra}</p> : null}
        </div>
        <button
          onClick={onPreview}
          className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          Preview Reset
        </button>
      </div>
    </div>
  );
}

function ConfirmPanel({
  phase, onClose, onProceed, onTypeChange, onConfirm,
  testCreatorCount, overlayRows, activityCounts, dbCounts,
}: {
  phase: Exclude<Phase, { step: "idle" }>;
  onClose: () => void;
  onProceed: (scope: ResetScope) => void;
  onTypeChange: (scope: ResetScope, v: string) => void;
  onConfirm: (scope: ResetScope) => void;
  testCreatorCount: number;
  overlayRows: number;
  activityCounts: { total: number; test: number };
  dbCounts: { gmailMessages: number; gmailPollStates: number; gmailConnections: number; auditRows: number } | null;
}) {
  const { scope } = phase;
  const willAffect = describeAffect(scope, { testCreatorCount, overlayRows, activityCounts, dbCounts });

  return (
    <div className="mt-5 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
          <ShieldAlert className="h-4 w-4" /> {SCOPE_TITLE[scope]}
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>

      {/* Preview step */}
      {phase.step === "review" ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-[11px] uppercase tracking-wide text-red-700">Will be removed</div>
              <ul className="mt-1 space-y-1 text-xs">
                {willAffect.remove.map((r, i) => (<li key={i} className="flex items-start gap-1.5"><Trash2 className="mt-0.5 h-3 w-3 shrink-0 text-red-600" /><span>{r}</span></li>))}
              </ul>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-[11px] uppercase tracking-wide text-emerald-700">Will be preserved</div>
              <ul className="mt-1 space-y-1 text-xs">
                {willAffect.keep.map((r, i) => (<li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /><span>{r}</span></li>))}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md bg-background p-2 text-xs text-muted-foreground">
            <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>A JSON backup of the current workspace state will download to your machine before deletion runs.</span>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => onProceed(scope)}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Continue to confirmation
            </button>
          </div>
        </>
      ) : null}

      {/* Confirm step */}
      {phase.step === "confirm" ? (
        <>
          <div className="mt-3 text-xs text-muted-foreground">
            To proceed, type <span className="font-mono font-semibold text-foreground">RESET TEST DATA</span> below.
          </div>
          <input
            autoFocus
            value={phase.typed}
            onChange={(e) => onTypeChange(scope, e.target.value)}
            placeholder="RESET TEST DATA"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={onClose} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-secondary">Cancel</button>
            <button
              onClick={() => onConfirm(scope)}
              disabled={phase.typed.trim() !== "RESET TEST DATA"}
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Download backup & run reset
            </button>
          </div>
        </>
      ) : null}

      {phase.step === "running" ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Running {SCOPE_TITLE[scope]}…
        </div>
      ) : null}

      {phase.step === "done" ? (
        <>
          <div className="mt-3 flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Reset complete.</div>
              <div className="mt-1 font-mono text-[11px]">
                {Object.entries(phase.affected).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </div>
              <div className="mt-2">
                Dashboard metrics and creator queues have already refreshed. Reload the app to fully rehydrate cached views.
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-secondary">Close</button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-[color:var(--forest)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-95"
            >
              Reload application
            </button>
          </div>
        </>
      ) : null}

      {phase.step === "error" ? (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-xs text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Reset failed.</div>
            <div className="mt-1 font-mono text-[11px]">{phase.message}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function describeAffect(
  scope: ResetScope,
  ctx: {
    testCreatorCount: number;
    overlayRows: number;
    activityCounts: { total: number; test: number };
    dbCounts: { gmailMessages: number; gmailPollStates: number } | null;
  },
): { remove: string[]; keep: string[] } {
  const gm = ctx.dbCounts?.gmailMessages ?? 0;
  const ps = ctx.dbCounts?.gmailPollStates ?? 0;
  if (scope === "test_activity") {
    return {
      remove: [
        `${ctx.activityCounts.test} test-tagged activity entr${ctx.activityCounts.test === 1 ? "y" : "ies"} (of ${ctx.activityCounts.total} total)`,
        `${gm} cached Gmail message${gm === 1 ? "" : "s"} across the team`,
        `${ps} Gmail poll checkpoint${ps === 1 ? "" : "s"}`,
        "Test drafts stored inside the app",
      ],
      keep: [
        "Every creator's imported spreadsheet fields (email, name, research notes, AI recommendation, ownership, contact history from the import)",
        "Real (non-test) activity entries recorded outside Test Mode",
        "Google authentication, team identities, roles, and Gmail account connections",
        "Knowledge Center content and creator profiles",
      ],
    };
  }
  if (scope === "test_creators") {
    return {
      remove: [
        `${ctx.testCreatorCount} test creator${ctx.testCreatorCount === 1 ? "" : "s"} matching TEST- / "TEST –" filters`,
        "All workflow overrides, activity, notes, and cached Gmail messages tied to those test creators",
      ],
      keep: [
        "Every real imported creator and their entire history",
        "Team identities, roles, Gmail connections, Knowledge Center",
      ],
    };
  }
  // full
  return {
    remove: [
      `${ctx.overlayRows} workspace override${ctx.overlayRows === 1 ? "" : "s"} across all creators (every workflow change goes back to imported values)`,
      `${gm} cached Gmail message${gm === 1 ? "" : "s"}`,
      `${ps} Gmail poll checkpoint${ps === 1 ? "" : "s"}`,
      "Cached dashboard metrics and notifications",
    ],
    keep: [
      "Imported creator directory + all original spreadsheet fields",
      "Research notes, AI recommendations, contact info",
      "Google authentication, roles, team configuration",
      "Gmail OAuth client and each teammate's Gmail connection",
      "Knowledge Center content",
    ],
  };
}

/* ---------------- Gmail Ops (Exec only) ---------------- */
function GmailOpsSubsection() {
  const listErrors = useServerFn(listGmailSendErrors);
  const getStatus = useServerFn(getGmailStatus);
  const [errs, setErrs] = useState<Array<{
    id: string; created_at: string; creator_id: string | null;
    http_status: number | null; error_reason: string | null; subject: string | null; recipient: string | null;
  }>>([]);
  const [poll, setPoll] = useState<{ lastPolledAt: string | null; lastErrorStatus: number | null; lastErrorReason: string | null; needsReconnect: boolean } | null>(null);
  const [recon, setRecon] = useState<ReturnType<typeof previewReconcileWaitingForReply> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [e, s] = await Promise.all([listErrors(), getStatus()]);
        setErrs(e.rows as typeof errs);
        if (s.connected) {
          setPoll({
            lastPolledAt: s.lastPolledAt ?? null,
            lastErrorStatus: s.lastErrorStatus ?? null,
            lastErrorReason: s.lastErrorReason ?? null,
            needsReconnect: !!s.needsReconnect,
          });
        } else {
          setPoll(null);
        }
      } catch { /* ignore */ }
      setRecon(previewReconcileWaitingForReply());
    })();
  }, [listErrors, getStatus, tick]);

  const runRecon = () => {
    const result = reconcileWaitingForReply();
    setTick((n) => n + 1);
    // eslint-disable-next-line no-alert
    alert(`Reconciled ${result.corrected} stale "Waiting for Reply" override${result.corrected === 1 ? "" : "s"}.`);
  };

  return (
    <div className="mt-6 space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Gmail sync health & reconciliation</h3>
        <button onClick={() => setTick((n) => n + 1)} className="text-xs text-muted-foreground hover:text-foreground">Refresh</button>
      </div>

      {/* Poll status */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last reply poll</div>
          <div className="mt-1 font-medium">{poll?.lastPolledAt ? new Date(poll.lastPolledAt).toLocaleString() : "—"}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Poll status</div>
          <div className={`mt-1 font-medium ${poll?.needsReconnect ? "text-red-700" : poll?.lastErrorStatus ? "text-amber-700" : "text-emerald-700"}`}>
            {poll?.needsReconnect ? "Reconnect required" : poll?.lastErrorStatus ? `Last error ${poll.lastErrorStatus}` : "Healthy"}
          </div>
          {poll?.lastErrorReason ? <div className="mt-0.5 text-[11px] text-muted-foreground">{poll.lastErrorReason}</div> : null}
        </div>
        <div className="rounded-md border border-border bg-card p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Send failures (30d)</div>
          <div className="mt-1 font-medium">{errs.length}</div>
        </div>
      </div>

      {/* Reconciliation */}
      <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Reconcile "Waiting for Reply" overrides</div>
            <p className="mt-1 text-xs text-muted-foreground">
              A creator only counts as Waiting for Reply when a confirmed Gmail send exists (message id captured).
              Legacy overrides without a captured message id will be cleared so dashboard and queue agree.
            </p>
            {recon ? (
              <div className="mt-2 text-xs">
                <span className="font-medium">{recon.staleOverrides.length}</span> stale override{recon.staleOverrides.length === 1 ? "" : "s"} found
                {recon.staleOverrides.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {recon.staleOverrides.slice(0, 6).map((s) => (
                      <li key={s.id}>· {s.name} <span className="opacity-60">({s.id})</span></li>
                    ))}
                    {recon.staleOverrides.length > 6 ? <li>· …and {recon.staleOverrides.length - 6} more</li> : null}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            onClick={runRecon}
            disabled={!recon || recon.staleOverrides.length === 0}
            className="shrink-0 rounded-md bg-[color:var(--forest)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-95 disabled:opacity-50"
          >
            Reconcile
          </button>
        </div>
      </div>

      {/* Send error log */}
      {errs.length > 0 ? (
        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-secondary px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Recent Gmail send failures
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Creator</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {errs.slice(0, 25).map((e) => {
                  const name = e.creator_id ? (CREATORS.find((c) => c.id === e.creator_id)?.name ?? e.creator_id) : "—";
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.recipient ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{e.http_status ?? "—"}</td>
                      <td className="px-3 py-2 text-red-800">{e.error_reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Test Creator (Exec only) ---------------- */
function TestCreatorSubsection() {
  const auth = useAuth();
  const tm = useTestMode();
  const testCreators = useTestCreators();
  const getStatus = useServerFn(getGmailStatus);
  const purge = useServerFn(purgeTestCreatorArtifacts);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getStatus();
        if (s.connected) setGmailEmail(s.emailAddress ?? null);
      } catch { /* ignore */ }
    })();
  }, [getStatus]);

  useEffect(() => {
    if (!email) {
      setEmail(
        gmailEmail ??
        (auth.status === "authenticated" ? auth.profile.email : ""),
      );
    }
  }, [gmailEmail, auth, email]);

  const canCreate = auth.status === "authenticated" && !!email.trim();

  const onCreate = () => {
    if (!canCreate || auth.status !== "authenticated") return;
    setBusy(true);
    try {
      const entry = createTestCreator({
        email: email.trim(),
        ownerUserId: auth.profile.userId,
        ownerName: auth.profile.fullName,
        ownerRoleLabel: auth.profile.roleLabel,
        testSessionId: tm.sessionId,
      });
      toast.success("Test creator created", {
        description: `${entry.name} · id ${entry.id}${tm.enabled ? " · tagged to current Test Mode session" : " (Test Mode is off — session tag is empty)"}`,
      });
    } finally { setBusy(false); }
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete test creator "${name}" and all linked test activity? This purges cached Gmail messages and error logs tied to this record. The recipient's Gmail inbox is not modified.`)) return;
    try {
      const r = await purge({ data: { creatorId: id } });
      clearWorkspaceForIds([id]);
      deleteTestCreator(id);
      toast.success("Removed", {
        description: `${r.messagesDeleted} cached message${r.messagesDeleted === 1 ? "" : "s"} · ${r.errorsDeleted} send-error log${r.errorsDeleted === 1 ? "" : "s"} purged.`,
      });
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Beaker className="h-4 w-4 text-amber-700" />
        <h3 className="text-sm font-medium">Safe Gmail test workflow</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">Executive Admin</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Create a synthetic <span className="font-mono">TEST – Gmail Workflow</span> creator to safely rehearse
        drafting, sending, labels, and reply syncing without touching a real influencer record.
        While Test Mode is on, every outbound email is redirected to
        <span className="ml-1 font-mono">{TEST_RECIPIENT_EMAIL}</span> and direct-send from real creator
        records is blocked.
      </p>

      {!tm.enabled ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-white p-2 text-[11px] text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Turn Test Mode on above before sending, so the new creator's activity is tagged with a session id
            and the recipient-redirect safety net is active.
          </span>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="text-xs">
          <span className="text-muted-foreground">Test creator email (defaults to your connected Gmail)</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          <span className="mt-1 block text-[10px] text-muted-foreground">
            Stored on the test record only. Actual Gmail delivery while Test Mode is on always goes to {TEST_RECIPIENT_EMAIL}.
          </span>
        </label>
        <button
          onClick={onCreate}
          disabled={!canCreate || busy}
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--forest)] px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
        >
          <Beaker className="h-4 w-4" /> Create Test Creator
        </button>
      </div>

      {testCreators.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-amber-200 p-3 text-[11px] text-muted-foreground">
          No test creators yet.
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
          {testCreators.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">Test</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{t.id}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t.email} · owner {t.ownerName ?? "—"} · session {t.testSessionId ?? "—"} · created {new Date(t.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <RouterLink
                  to="/creators/$id"
                  params={{ id: t.id }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-secondary"
                >
                  Open
                </RouterLink>
                <button
                  onClick={() => onDelete(t.id, t.name)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

