import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  creatorById,
  OUTREACH_TEMPLATES,
  renderTemplate,
  priorityTone,
  ownerTone,
  perryTone,
  sampleTone,
  responseTone,
  isOverdue,
  type CreatorRow,
} from "@/lib/creator-partnerships";
import { ContactLog } from "@/components/creators/ContactLog";
import { ContentPieces } from "@/components/creators/ContentPieces";
import { DealROI } from "@/components/creators/DealROI";
import {
  useWorkspace,
  updateWorkspace,
  addActivity,
  clearWorkspaceForIds,
  isTestCreatorId,
  SURVIVAL_FLAVORS,
  REVIEW_STATUSES,
  type Activity,
  type OutreachStatus,
  type DeliveryStatus,
  type SurvivalFlavor,
  type ReviewStatus,
} from "@/lib/creator-workspace";

import {
  computeStage,
  nextAction,
  primaryActions,
  relationshipHealth,
  healthTone,
  healthDot,
  stageTone,
  daysBetween,
  timeAgo,
} from "@/lib/creator-workflow";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentTeamMember } from "@/lib/current-team-member";
import { ArrowLeft, ExternalLink, Mail, Copy, Send, Truck, ShieldCheck, Clock, AlertCircle, UserCheck, FileText, ListChecks, StickyNote, Compass, Activity as ActivityIcon, Heart, CalendarClock, Trash2, Beaker, Star, Flag } from "lucide-react";
import { GmailPanel } from "@/components/creators/GmailPanel";
import { deleteTestCreator, getTestCreatorRow, useTestCreators } from "@/lib/test-creators";
import { purgeTestCreatorArtifacts, listCreatorMessages } from "@/lib/gmail.functions";
import { suggestShippingNoteFromThread } from "@/lib/ai-research.functions";

import { useAuth } from "@/lib/current-user";
import { externalLinkProps, outlookComposeUrl } from "@/lib/external-link";


export const Route = createFileRoute("/creators/$id")({
  loader: ({ params }) => {
    // Real creator OR synthetic TEST creator overlay (localStorage).
    const c = creatorById(params.id) ?? getTestCreatorRow(params.id);
    if (!c) throw notFound();
    return { creator: c };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.creator;
    const title = c ? `${c.name} — Survival Tabs Partnerships` : "Creator — Survival Tabs";
    const desc = c ? `${c.segment ?? "Creator"} · Owner ${c.outreachOwner ?? "unassigned"} · ${c.responseState}` : "Creator partnership record";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: ({ error, reset }) => (
    <div className="p-8">
      <p className="text-sm text-destructive">Error loading creator: {String(error)}</p>
      <button onClick={reset} className="mt-2 text-sm underline">Retry</button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8">
      <p className="text-sm">Creator not found.</p>
      <Link to="/creators" className="mt-2 inline-block text-sm text-primary underline">Back to Creator Partnerships</Link>
    </div>
  ),
  component: CreatorDetail,
});


type Tab = "overview" | "communications" | "timeline" | "shipping" | "content" | "roi" | "relationship" | "notes" | "raw";

function CreatorDetail() {
  const { creator: c } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("overview");
  const overdue = isOverdue(c);
  const ws = useWorkspace(c);
  const auth = useAuth();
  const navigate = useNavigate();
  const testCreators = useTestCreators();
  const purge = useServerFn(purgeTestCreatorArtifacts);
  const isTest = isTestCreatorId(c.id, c.name);
  const isExecutive = auth.status === "authenticated" && auth.profile.role === "executive";
  const canDeleteTest = isTest && (
    isExecutive ||
    (auth.status === "authenticated" &&
      testCreators.find((t) => t.id === c.id)?.ownerUserId === auth.profile.userId)
  );

  const onDeleteTest = async () => {
    if (!isTest) return;
    if (!confirm(`Delete test creator "${c.name}" and all linked test activity? This also purges cached Gmail messages tied to this record. The recipient's Gmail inbox is not modified.`)) return;
    try {
      const r = await purge({ data: { creatorId: c.id } });
      clearWorkspaceForIds([c.id]);
      deleteTestCreator(c.id);
      toast.success("Test creator removed", {
        description: `${r.messagesDeleted} cached message${r.messagesDeleted === 1 ? "" : "s"} · ${r.errorsDeleted} send-error log${r.errorsDeleted === 1 ? "" : "s"} purged.`,
      });
      navigate({ to: "/creators" });
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div>
      <Link to="/creators" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Creator Partnerships
      </Link>

      <PageHeader
        eyebrow={`${c.id} · Supervisor RENA · Owner ${ws.currentOwner ?? "Unassigned"}`}
        title={c.name}
        description={c.segment ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isTest ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                <Beaker className="h-3 w-3" /> Test Creator
              </span>
            ) : null}
            <span className={`inline-flex rounded px-2 py-1 text-[11px] ${priorityTone(c.priority)}`}>{c.priority ?? "No priority"}</span>
            <span className={`inline-flex rounded px-2 py-1 text-[11px] ${ownerTone(ws.currentOwner)}`}>{ws.currentOwner ?? "Unassigned"}</span>
            <span className={`inline-flex rounded px-2 py-1 text-[11px] ${perryTone(c.perryApproval)}`}>
              Perry: {c.perryApproval}
            </span>
            {canDeleteTest ? (
              <button
                onClick={onDeleteTest}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-800 hover:bg-red-100"
              >
                <Trash2 className="h-3 w-3" /> Delete test creator
              </button>
            ) : null}
          </div>

        }
      />

      <WorkflowCard c={c} onJump={setTab} />

      <PositiveReplyNudge c={c} onJump={setTab} />

      <ReviewAndImportantBar c={c} />

      {/* Snapshot */}
      <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
        <SnapshotCard icon={<Mail className="h-4 w-4" />} label="Outreach" value={ws.outreachStatus} tone="bg-secondary text-secondary-foreground" />
        <SnapshotCard icon={<Truck className="h-4 w-4" />} label="Delivery" value={ws.deliveryStatus} tone={sampleTone(c.normalizedSampleStatus)} />
        <SnapshotCard
          icon={<Clock className="h-4 w-4" />}
          label="Next follow-up"
          value={ws.nextFollowUpDate ?? "—"}
          tone={overdue ? "bg-red-100 text-red-800" : "bg-secondary text-secondary-foreground"}
          extra={overdue ? <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-red-700"><AlertCircle className="h-3 w-3" /> Overdue</span> : null}
        />
        <SnapshotCard icon={<ShieldCheck className="h-4 w-4" />} label="Perry (advisory)" value={c.perryApproval} tone={perryTone(c.perryApproval)} />
      </section>

      {/* Tabs — consolidated single workspace */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["overview", "Overview"],
            ["communications", "Communications"],
            ["timeline", "Timeline"],
            ["shipping", "Shipping"],
            ["content", "Content"],
            ["roi", "Deal & ROI"],
            ["relationship", "Relationship"],
            ["notes", "Notes"],
            ["raw", "All sheet fields"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`border-b-2 px-3 py-2 text-sm transition ${
              tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview c={c} />}
      {tab === "communications" && (
        <div className="space-y-4">
          <GmailPanel c={c} />
          <ContactLog c={c} />
        </div>
      )}
      {tab === "timeline" && <ActivityTimeline c={c} />}
      {tab === "shipping" && <Shipping c={c} />}
      {tab === "content" && (
        <div className="space-y-4">
          <ContentPanel c={c} />
          <ContentPieces c={c} />
        </div>
      )}
      {tab === "roi" && <DealROI c={c} />}
      {tab === "relationship" && <RelationshipPanel c={c} />}
      {tab === "notes" && <InternalNotes c={c} />}
      {tab === "raw" && <RawFields c={c} />}
    </div>
  );
}


function SnapshotCard({ icon, label, value, tone, extra }: { icon: React.ReactNode; label: string; value: string; tone: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className={`inline-flex rounded px-2 py-1 text-xs font-medium ${tone}`}>{value}</div>
      {extra}
    </div>
  );
}

function WorkflowCard({ c, onJump }: { c: CreatorRow; onJump: (t: Tab) => void }) {
  const ws = useWorkspace(c);
  const stage = computeStage(c, ws);
  const health = relationshipHealth(c, ws);
  const actions = primaryActions(c, ws, stage);
  const followDays = daysBetween(ws.nextFollowUpDate);
  const lastDays = daysBetween(ws.lastContactDate ?? ws.dateSent);
  const overdueFollow = followDays !== null && followDays < 0;

  return (
    <section className="mb-5 rounded-xl border border-border bg-card shadow-sm">
      {/* Work-queue chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-[11px]">
        <Chip label="Owner" value={ws.currentOwner ?? "Unassigned"} />
        <Chip label="Supervisor" value="RENA" />
        <Chip label="Priority" value={c.priority ?? "—"} />
        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${stageTone(stage)}`}>
          <Compass className="h-3 w-3" /> {stage}
        </span>
        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${healthTone(health)}`}>
          <span>{healthDot(health)}</span> {health}
        </span>
        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${overdueFollow ? "bg-red-100 text-red-800" : "bg-secondary text-secondary-foreground"}`}>
          <CalendarClock className="h-3 w-3" />
          {ws.nextFollowUpDate
            ? overdueFollow
              ? `Overdue by ${-followDays!} day${-followDays! === 1 ? "" : "s"}`
              : followDays === 0
                ? "Follow-up today"
                : `Follow-up in ${followDays} day${followDays === 1 ? "" : "s"}`
            : "No follow-up scheduled"}
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px_220px]">
        {/* Current stage + recommendation + actions */}
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Current stage</div>
          <div className={`mb-2 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold ${stageTone(stage)}`}>
            <ActivityIcon className="h-4 w-4" /> {stage}
          </div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Recommended next action</div>
          <p className="mb-3 text-sm text-foreground">{nextAction(stage)}</p>
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    if (a.jumpTo) onJump(a.jumpTo as Tab);
                    else a.run?.();
                  }}
                  className={
                    a.variant === "primary"
                      ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      : "rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No guided actions for this stage.</p>
          )}
        </div>

        {/* Next follow-up */}
        <div className={`rounded-lg border p-3 ${overdueFollow ? "border-red-200 bg-red-50" : "border-border bg-secondary/40"}`}>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Next follow-up
          </div>
          <div className={`text-lg font-semibold ${overdueFollow ? "text-red-800" : "text-foreground"}`}>
            {ws.nextFollowUpDate ?? "Not scheduled"}
          </div>
          <div className={`text-xs ${overdueFollow ? "text-red-700" : "text-muted-foreground"}`}>
            {ws.nextFollowUpDate
              ? overdueFollow
                ? `Overdue by ${-followDays!} day${-followDays! === 1 ? "" : "s"}`
                : followDays === 0
                  ? "Due today"
                  : `In ${followDays} day${followDays === 1 ? "" : "s"}`
              : "Set a date in the Outreach tab"}
          </div>
        </div>

        {/* Last contact */}
        <div className="rounded-lg border border-border bg-secondary/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Heart className="h-3.5 w-3.5" /> Last contact
          </div>
          <div className="text-sm font-medium text-foreground">
            {ws.contactMethod ?? c.contactMethod ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {ws.lastContactDate ?? ws.dateSent ?? "No outreach yet"}
            {lastDays !== null ? ` · ${timeAgo(ws.lastContactDate ?? ws.dateSent)}` : ""}
          </div>
          {ws.activity.length > 0 ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Last activity: <span className="text-foreground">{ws.activity[ws.activity.length - 1].action}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-secondary-foreground">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function Overview({ c }: { c: CreatorRow }) {

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Identity & reach">
        <KV k="Segment" v={c.segment} />
        <KV k="Primary platforms" v={c.primaryPlatforms} />
        <KV k="Reach / location" v={c.reachSignal} />
        <KV k="Followers signal" v={c.followersSignal} />
        <KV k="Target audience" v={c.targetAudience} />
        <KV k="Geography" v={c.geography} />
        <KV k="Geo confidence" v={c.geographyConfidence} />
        <div className="mt-2 flex flex-wrap gap-2">
          {c.instagram && <PlatformLink label="Instagram" url={c.instagram} />}
          {c.youtube && <PlatformLink label="YouTube" url={c.youtube} />}
          {c.tiktok && <PlatformLink label="TikTok" url={c.tiktok} />}
          {c.facebook && <PlatformLink label="Facebook" url={c.facebook} />}
          {c.otherPlatform && <PlatformLink label="Other" url={c.otherPlatform} />}
        </div>
      </Card>

      <Card title="Contact">
        <KV k="Email" v={c.email} mono />
        <KV k="Contact route" v={c.contactRoute} link />
        <KV k="Confidence" v={c.contactConfidence} />
        <KV k="Preferred method" v={c.contactMethod} />
        <KV k="Amazon" v={c.amazon} />
        <KV k="Monetization" v={c.monetization} />
      </Card>

      <Card title="Research">
        <KV k="Status" v={c.researchStatus} />
        <KV k="Last researched" v={c.lastResearched} />
        <KV k="Research notes" v={c.researchNotes} />
        <KV k="Seth next action" v={c.sethNextAction} />
        <KV k="Verification" v={c.fullVerification} />
        <KV k="Verified on" v={c.verificationDate} />
      </Card>

      <Card title="Offer & partnership">
        <KV k="Recommended offer" v={c.recommendedOffer} />
        <KV k="Partnership tier" v={c.partnershipTier} />
        <KV k="Offer confidence" v={c.offerConfidence} />
        <KV k="Reasoning" v={c.offerReasoning} />
        <KV k="Tuan affiliate" v={c.tuanAffiliateStatus} />
        <KV k="Creator code / link" v={c.creatorCode} />
      </Card>

      {c.renaNotes ? (
        <Card title="Rena notes" full>
          <p className="text-sm">{c.renaNotes}</p>
        </Card>
      ) : null}
      {c.perryComments ? (
        <Card title="Perry comments" full>
          <p className="text-sm">{c.perryComments}</p>
        </Card>
      ) : null}
    </div>
  );
}

function OutreachPanel({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Outreach status">
        <FieldRow label="Status">
          <select
            value={ws.outreachStatus}
            onChange={(e) => updateWorkspace(c.id, { outreachStatus: e.target.value as OutreachStatus })}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {["Not Started", "Draft Ready", "Sent", "Follow-up Sent", "Replied", "No Response"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Contact method">
          <input
            value={ws.contactMethod ?? ""}
            onChange={(e) => updateWorkspace(c.id, { contactMethod: e.target.value || null })}
            placeholder="Email / DM / Call"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </FieldRow>
        <FieldRow label="Email draft created">
          <Toggle checked={ws.emailDraftCreated} onChange={(v) => updateWorkspace(c.id, { emailDraftCreated: v })} />
        </FieldRow>
        <FieldRow label="Email sent">
          <Toggle checked={ws.emailSent} onChange={(v) => updateWorkspace(c.id, { emailSent: v })} />
        </FieldRow>
        <FieldRow label="Date sent">
          <DateInput value={ws.dateSent} onChange={(v) => updateWorkspace(c.id, { dateSent: v })} />
        </FieldRow>
        <FieldRow label="Last contact date">
          <DateInput value={ws.lastContactDate} onChange={(v) => updateWorkspace(c.id, { lastContactDate: v })} />
        </FieldRow>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => addActivity(c, { at: today, actor: (ws.currentOwner ?? "RENA") as any, kind: "email_sent", action: "Outreach email sent" })}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Log email sent
          </button>
          <button
            onClick={() => addActivity(c, { at: today, actor: (ws.currentOwner ?? "RENA") as any, kind: "followup_sent", action: "Follow-up sent" })}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-secondary"
          >
            Log follow-up
          </button>
          <button
            onClick={() => addActivity(c, { at: today, actor: (ws.currentOwner ?? "RENA") as any, kind: "creator_replied", action: "Creator replied" })}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-secondary"
          >
            Mark replied
          </button>
        </div>
      </Card>

      <Card title="Follow-up">
        <FieldRow label="Next follow-up date">
          <DateInput value={ws.nextFollowUpDate} onChange={(v) => updateWorkspace(c.id, { nextFollowUpDate: v })} />
        </FieldRow>
        <FieldRow label="Follow-up count">
          <input
            type="number"
            min={0}
            value={ws.followUpCount}
            onChange={(e) => updateWorkspace(c.id, { followUpCount: Math.max(0, Number(e.target.value) || 0) })}
            className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </FieldRow>
        <FieldRow label="Waiting for reply">
          <Toggle checked={ws.waitingForReply} onChange={(v) => updateWorkspace(c.id, { waitingForReply: v })} />
        </FieldRow>
        <FieldRow label="No response">
          <Toggle checked={ws.noResponse} onChange={(v) => updateWorkspace(c.id, { noResponse: v })} />
        </FieldRow>
        <FieldRow label="Responded">
          <Toggle checked={ws.responded} onChange={(v) => updateWorkspace(c.id, { responded: v })} />
        </FieldRow>
        <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs">
          <div className="mb-1 font-medium">Original sheet values</div>
          <div>Contacted: {c.contactedDate ?? "—"} · Method: {c.contactMethod ?? "—"}</div>
          <div>Response / follow-up: {c.responseFollowup ?? "—"}</div>
        </div>
      </Card>

      <Card title="Outreach history (auto)" full>
        <OutreachHistory c={c} />
      </Card>
    </div>
  );
}

function AssignmentPanel({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  const today = new Date().toISOString().slice(0, 10);
  const assign = (to: "RENA" | null) => {
    updateWorkspace(c.id, { assignedTo: to, currentOwner: to, assignedDate: to ? today : null });
    if (to) addActivity(c, { at: today, actor: "RENA", kind: "assigned_rena", action: "Assigned to Rena" });
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Assignment">
        <FieldRow label="Assigned to">
          <div className="flex gap-1">
            {(["RENA"] as const).map((o) => (
              <button
                key={o}
                onClick={() => assign(o)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${ws.assignedTo === o ? "bg-primary text-primary-foreground" : "border border-input hover:bg-secondary"}`}
              >
                {"Rena"}
              </button>
            ))}
            <button onClick={() => assign(null)} className="rounded-md border border-input px-3 py-1 text-xs hover:bg-secondary">
              Unassign
            </button>
          </div>
        </FieldRow>
        <FieldRow label="Assigned date">
          <DateInput value={ws.assignedDate} onChange={(v) => updateWorkspace(c.id, { assignedDate: v })} />
        </FieldRow>
        <FieldRow label="Current owner">
          <span className={`inline-flex rounded px-2 py-0.5 text-[11px] ${ownerTone(ws.currentOwner)}`}>
            {ws.currentOwner ?? "Unassigned"}
          </span>
        </FieldRow>
        <FieldRow label="Supervisor">
          <span className="inline-flex rounded bg-[color:var(--forest)]/15 px-2 py-0.5 text-[11px] font-medium text-[color:var(--forest)]">RENA</span>
        </FieldRow>
      </Card>
      <Card title="Workflow">
        <ol className="space-y-1.5 text-sm">
          {[
            "Research (Seth + AI)",
            "AI Recommendation",
            "Assigned to Rena",
            "Outreach",
            "Follow-up",
            "Sample / Shipping",
            "Content",
            "Relationship Management",
          ].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[10px]">{i + 1}</span>
              <span className="text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Perry provides executive oversight and may comment or override at any point. The workflow never waits on Perry.
        </p>
      </Card>
    </div>
  );
}

function ContentPanel({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  const platforms = ["Instagram", "YouTube", "TikTok", "Facebook", "Blog", "Podcast"];
  const toggle = (p: string) => {
    const has = ws.publishedPlatforms.includes(p);
    updateWorkspace(c.id, {
      publishedPlatforms: has ? ws.publishedPlatforms.filter((x) => x !== p) : [...ws.publishedPlatforms, p],
    });
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Content deliverables">
        <FieldRow label="Content promised">
          <input
            value={ws.contentPromised ?? ""}
            onChange={(e) => updateWorkspace(c.id, { contentPromised: e.target.value || null })}
            placeholder="e.g. 1 Reel + 3 stories"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </FieldRow>
        <FieldRow label="Content received">
          <Toggle checked={ws.contentReceived} onChange={(v) => updateWorkspace(c.id, { contentReceived: v })} />
        </FieldRow>
        <FieldRow label="Publish date">
          <DateInput value={ws.publishDate} onChange={(v) => updateWorkspace(c.id, { publishDate: v })} />
        </FieldRow>
      </Card>
      <Card title="Published platforms">
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => {
            const on = ws.publishedPlatforms.includes(p);
            return (
              <button
                key={p}
                onClick={() => toggle(p)}
                className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-secondary"}`}
              >
                {p}
              </button>
            );
          })}
        </div>
        {ws.contentReceived && ws.publishDate ? (
          <button
            onClick={() => addActivity(c, { at: ws.publishDate!, actor: (ws.currentOwner ?? "RENA") as any, kind: "content_published", action: `Content published on ${ws.publishedPlatforms.join(", ") || "platform"}` })}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Log "content published"
          </button>
        ) : null}
      </Card>
    </div>
  );
}

function ActivityTimeline({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  const me = useCurrentTeamMember();
  const [note, setNote] = useState("");
  const submit = () => {
    if (!note.trim()) return;
    addActivity(c, {
      at: new Date().toISOString().slice(0, 10),
      actor: me.id,
      kind: "note",
      action: "Note",
      notes: note.trim(),
    });
    setNote("");
  };
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <Card title="Chronological activity">
        {ws.activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {ws.activity.map((e) => (
              <li key={e.id} className="rounded-md border border-border bg-secondary/40 p-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-card px-1.5 py-0.5 font-medium text-foreground">
                      {e.actorName ?? e.actor}
                    </span>
                    {e.actorRoleLabel ? (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {e.actorRoleLabel}
                      </span>
                    ) : null}
                    <span className="text-foreground">{e.action}</span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                      {e.kind.replace(/_/g, " ")}
                    </span>
                  </div>
                  <span className="whitespace-nowrap">
                    {e.at}{e.time ? ` · ${e.time}` : ""}
                  </span>
                </div>
                {e.notes ? <p className="whitespace-pre-wrap text-sm">{e.notes}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card title="Log a note">
        <div className="mb-3 rounded-md border border-border bg-secondary/40 p-2 text-xs">
          Posting as <span className="font-medium text-foreground">{me.name}</span>
          <span className="text-muted-foreground"> · {me.title}</span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened?"
          className="h-32 w-full rounded-md border border-input bg-background p-2 text-sm"
        />
        <button
          onClick={submit}
          className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add to timeline
        </button>
      </Card>
    </div>
  );
}

function InternalNotes({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <NoteCard title="Team notes" icon={<StickyNote className="h-4 w-4" />} value={ws.teamNotes} onChange={(v) => updateWorkspace(c.id, { teamNotes: v })} />
      <NoteCard title="AI recommendation" icon={<ListChecks className="h-4 w-4" />} value={ws.aiRecommendation} onChange={(v) => updateWorkspace(c.id, { aiRecommendation: v })} />
      <NoteCard title="Research notes (Seth)" icon={<FileText className="h-4 w-4" />} value={ws.researchNotes} onChange={(v) => updateWorkspace(c.id, { researchNotes: v })} />
      <NoteCard title="Executive notes (Perry)" icon={<ShieldCheck className="h-4 w-4" />} value={ws.executiveNotes} onChange={(v) => updateWorkspace(c.id, { executiveNotes: v })} />
    </div>
  );
}

function NoteCard({ title, icon, value, onChange }: { title: string; icon: React.ReactNode; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">{icon}{title}</h3>
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="—"
        className="h-32 w-full rounded-md border border-input bg-background p-2 text-sm"
      />
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 grid grid-cols-[160px_1fr] items-center gap-2 text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`inline-flex h-5 w-9 items-center rounded-full transition ${checked ? "bg-primary" : "bg-secondary"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-background transition ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

function DateInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
    />
  );
}

// Legacy OutreachHistory (kept as sub-component for OutreachPanel)
function OutreachHistory({ c }: { c: CreatorRow }) {

  return (
    <Card title="Outreach timeline">
      {c.outreachHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No outreach recorded yet. Draft the first message in the Email tab.</p>
      ) : (
        <ol className="space-y-3">
          {c.outreachHistory.map((e) => (
            <li key={e.id} className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-card px-1.5 py-0.5 font-medium text-foreground">{e.actor}</span>
                  <span>{e.channel}</span>
                  {e.subject ? <span className="text-foreground">· {e.subject}</span> : null}
                </div>
                <span>{e.at}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{e.body}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <KV k="Contacted date" v={c.contactedDate} />
        <KV k="Contact method" v={c.contactMethod} />
        <KV k="Response / follow-up" v={c.responseFollowup} />
      </div>
    </Card>
  );
}

function EmailDrafter({ c }: { c: CreatorRow }) {
  const owner = c.outreachOwner ?? "RENA";
  const [tplId, setTplId] = useState(OUTREACH_TEMPLATES[0].id);
  const tpl = OUTREACH_TEMPLATES.find((t) => t.id === tplId)!;
  const rendered = useMemo(() => renderTemplate(tpl, c, owner), [tpl, c, owner]);
  const [subject, setSubject] = useState(rendered.subject);
  const [body, setBody] = useState(rendered.body);
  const [dirty, setDirty] = useState(false);
  const useRendered = () => {
    setSubject(rendered.subject);
    setBody(rendered.body);
    setDirty(false);
  };

  const to = c.email ?? "";
  const outlook = outlookComposeUrl(to, subject, body);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <aside className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Templates</div>
        <ul className="space-y-1">
          {OUTREACH_TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  setTplId(t.id);
                  const r = renderTemplate(t, c, owner);
                  setSubject(r.subject);
                  setBody(r.body);
                  setDirty(false);
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                  tplId === t.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 text-[11px] text-muted-foreground">
          <div>Signing as <strong>{owner}</strong></div>
          <div>Perry gate: <strong>{c.perryApproval}</strong></div>
          {c.perryApproval !== "Approved" && c.normalizedSampleStatus === "Approval Pending" ? (
            <div className="text-red-700">Hold — Perry must approve before shipping.</div>
          ) : null}
        </div>
      </aside>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 grid grid-cols-[70px_1fr] items-center gap-2 text-sm">
          <label className="text-muted-foreground">To</label>
          <input
            value={to}
            readOnly
            className="rounded-md border border-input bg-secondary/40 px-2 py-1.5 font-mono text-xs"
          />
          <label className="text-muted-foreground">Subject</label>
          <input
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setDirty(true); }}
          className="h-72 w-full rounded-md border border-input bg-background p-2 text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            {...externalLinkProps(gmail)}
            className={`inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 ${!to ? "pointer-events-none opacity-50" : ""}`}
          >
            <Send className="h-4 w-4" /> Open in Gmail
          </a>
          <a
            {...externalLinkProps(outlook)}
            title="The message is prefilled. Attach the approved product photo before sending."
            className={`inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-secondary ${!to ? "pointer-events-none opacity-50" : ""}`}
          >
            <Mail className="h-4 w-4" /> Outlook · attach photo
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
          {dirty ? (
            <button onClick={useRendered} className="text-xs text-muted-foreground underline">Reset to template</button>
          ) : null}
          {!to ? <span className="text-xs text-red-700">No verified email on file — use contact route instead.</span> : null}
        </div>
      </div>
    </div>
  );
}

function Shipping({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  const today = new Date().toISOString().slice(0, 10);
  const stages: { key: string; label: string; done: boolean }[] = [
    { key: "req", label: "Sample required", done: ws.sampleRequired },
    { key: "address", label: "Address received", done: ws.addressReceived },
    { key: "shipped", label: "Sample shipped", done: ws.sampleShipped },
    { key: "delivered", label: "Delivered", done: ws.deliveryStatus === "Delivered" },
  ];
  const setShip = (patch: Partial<{
    shippingName: string | null; shippingCompany: string | null;
    shippingAddress1: string | null; shippingAddress2: string | null;
    shippingCity: string | null; shippingState: string | null;
    shippingPostalCode: string | null; shippingCountry: string | null;
    carrier: string | null;
  }>) => updateWorkspace(c.id, patch);
  const addr = [
    ws.shippingName, ws.shippingCompany, ws.shippingAddress1, ws.shippingAddress2,
    [ws.shippingCity, ws.shippingState, ws.shippingPostalCode].filter(Boolean).join(", "),
    ws.shippingCountry,
  ].filter((x): x is string => !!x && x.trim().length > 0).join("\n");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Shipping workflow">
        <ol className="mb-4 space-y-2">
          {stages.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${s.done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{i + 1}</span>
              <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
            </li>
          ))}
        </ol>
        <FieldRow label="Sample required">
          <Toggle checked={ws.sampleRequired} onChange={(v) => updateWorkspace(c.id, { sampleRequired: v })} />
        </FieldRow>
        <FieldRow label="Address received">
          <Toggle checked={ws.addressReceived} onChange={(v) => updateWorkspace(c.id, { addressReceived: v })} />
        </FieldRow>
        <FieldRow label="Sample shipped">
          <Toggle checked={ws.sampleShipped} onChange={(v) => updateWorkspace(c.id, { sampleShipped: v })} />
        </FieldRow>
        <FieldRow label="Carrier">
          <select
            value={ws.carrier ?? ""}
            onChange={(e) => setShip({ carrier: e.target.value || null })}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="">— Select —</option>
            {["USPS", "UPS", "FedEx", "DHL", "Other"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Tracking number">
          <input
            value={ws.trackingNumber ?? ""}
            onChange={(e) => updateWorkspace(c.id, { trackingNumber: e.target.value || null })}
            placeholder="1Z…"
            className="w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-xs"
          />
        </FieldRow>
        <FieldRow label="Delivery status">
          <select
            value={ws.deliveryStatus}
            onChange={(e) => updateWorkspace(c.id, { deliveryStatus: e.target.value as DeliveryStatus })}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {["Not Shipped", "Preparing", "In Transit", "Delivered", "Returned", "Failed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FieldRow>
        <button
          onClick={() => addActivity(c, { at: today, actor: (ws.currentOwner ?? "RENA") as any, kind: "sample_shipped", action: "Sample shipped", notes: ws.trackingNumber ? `Tracking ${ws.trackingNumber} (${ws.carrier ?? "carrier"})` : undefined })}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Log "sample shipped"
        </button>
      </Card>

      <Card title="Shipping address">
        <FieldRow label="Recipient name">
          <input value={ws.shippingName ?? ""} onChange={(e) => setShip({ shippingName: e.target.value || null })}
            placeholder="Full name for the carrier"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        <FieldRow label="Company">
          <input value={ws.shippingCompany ?? ""} onChange={(e) => setShip({ shippingCompany: e.target.value || null })}
            placeholder="(optional)"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        <FieldRow label="Address line 1">
          <input value={ws.shippingAddress1 ?? ""} onChange={(e) => setShip({ shippingAddress1: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        <FieldRow label="Address line 2">
          <input value={ws.shippingAddress2 ?? ""} onChange={(e) => setShip({ shippingAddress2: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        <FieldRow label="City">
          <input value={ws.shippingCity ?? ""} onChange={(e) => setShip({ shippingCity: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        <FieldRow label="State / region">
          <input value={ws.shippingState ?? ""} onChange={(e) => setShip({ shippingState: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        <FieldRow label="Postal code">
          <input value={ws.shippingPostalCode ?? ""} onChange={(e) => setShip({ shippingPostalCode: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        <FieldRow label="Country">
          <input value={ws.shippingCountry ?? ""} onChange={(e) => setShip({ shippingCountry: e.target.value || null })}
            placeholder="USA"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </FieldRow>
        {addr ? (
          <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs">
            <div className="mb-1 font-medium">Address preview</div>
            <pre className="whitespace-pre-wrap font-mono text-[11px]">{addr}</pre>
            <button
              onClick={() => { navigator.clipboard.writeText(addr); }}
              className="mt-2 rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-secondary"
            >
              Copy address
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
            No shipping address yet. Fill in the fields above once the creator sends it.
          </div>
        )}
      </Card>

      <div className="md:col-span-2">
        <SampleAndNotePanel c={c} />
      </div>

      <Card title="From master sheet" full>
        <div className="grid gap-2 md:grid-cols-2">
          <KV k="Sample status (raw)" v={c.sampleStatus} />
          <KV k="Perry approval" v={c.perryApproval} />
          <KV k="Recommended offer" v={c.recommendedOffer} />
          <KV k="Partnership tier" v={c.partnershipTier} />
          <KV k="Rena notes" v={c.renaNotes} />
        </div>
      </Card>
    </div>
  );
}

function SampleAndNotePanel({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  const list = useServerFn(listCreatorMessages);
  const suggest = useServerFn(suggestShippingNoteFromThread);
  const [messages, setMessages] = useState<Array<{
    id: string; direction: string; from_name: string | null; from_email: string | null;
    subject: string | null; snippet: string | null; sent_at: string | null;
  }> | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestReason, setSuggestReason] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const loadThread = async () => {
    setLoadingThread(true);
    try {
      const res = await list({ data: { creatorId: c.id } });
      setMessages((res.messages ?? []) as never);
    } catch (e) {
      toast.error(`Couldn't load thread: ${(e as Error).message}`);
    } finally {
      setLoadingThread(false);
    }
  };

  const runSuggest = async () => {
    setSuggesting(true);
    setSuggestion(null);
    setSuggestReason(null);
    try {
      const res = await suggest({ data: { creatorId: c.id } });
      if (res.note) setSuggestion(res.note);
      else setSuggestReason(res.reason ?? "No suggestion available.");
    } catch (e) {
      toast.error(`Suggestion failed: ${(e as Error).message}`);
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    updateWorkspace(c.id, { shippingNote: suggestion });
    setSuggestion(null);
    toast.success("Shipping note updated. Review and save any further edits.");
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Sample details & shipping note</h3>
        <span className="text-[11px] text-muted-foreground">
          Suggestions are drafts — nothing saves until you confirm.
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: fields */}
        <div className="space-y-3">
          <FieldRow label="Product requested">
            <select
              value={ws.productRequested ?? ""}
              onChange={(e) => updateWorkspace(c.id, { productRequested: (e.target.value || null) as SurvivalFlavor | null })}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="">— Select flavor —</option>
              {SURVIVAL_FLAVORS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Quantity">
            <input
              type="number" min={0} step={1}
              value={ws.quantity ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                updateWorkspace(c.id, { quantity: v === "" ? null : Math.max(0, Number(v)) });
              }}
              placeholder="e.g. 2"
              className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </FieldRow>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Shipping note (goes to the packer)</label>
              <button
                onClick={runSuggest}
                disabled={suggesting}
                className="rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-secondary disabled:opacity-60"
              >
                {suggesting ? "Reading thread…" : "Suggest note from conversation"}
              </button>
            </div>
            <textarea
              value={ws.shippingNote ?? ""}
              onChange={(e) => updateWorkspace(c.id, { shippingNote: e.target.value || null })}
              rows={6}
              placeholder={"e.g.\n- Prefers Chocolate + Vanilla\n- Nut allergy — flag on packing slip\n- Ring bell twice, no doorman"}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />
            {suggestion ? (
              <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2">
                <div className="mb-1 text-[11px] font-medium text-primary">Suggested note — review before applying</div>
                <pre className="whitespace-pre-wrap font-sans text-xs">{suggestion}</pre>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={applySuggestion}
                    className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Use this note
                  </button>
                  <button
                    onClick={() => setSuggestion(null)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-secondary"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : suggestReason ? (
              <div className="mt-2 text-[11px] text-muted-foreground">{suggestReason}</div>
            ) : null}
          </div>
        </div>

        {/* Right: Gmail thread */}
        <div className="rounded-md border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
            <div className="text-xs font-medium">Gmail conversation</div>
            <button
              onClick={loadThread}
              className="rounded-md border border-input bg-background px-2 py-0.5 text-[11px] hover:bg-secondary"
            >
              {messages === null ? (loadingThread ? "Loading…" : "Load thread") : (loadingThread ? "Refreshing…" : "Refresh")}
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {messages === null ? (
              <div className="p-3 text-[11px] text-muted-foreground">
                Load the thread to write the shipping note with the real conversation in view.
              </div>
            ) : messages.length === 0 ? (
              <div className="p-3 text-[11px] text-muted-foreground">
                No Gmail messages recorded for this creator yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {messages.map((m) => (
                  <li key={m.id} className="rounded-md border border-border p-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {m.direction === "outbound" ? "→ Us" : `← ${m.from_name || m.from_email || "Creator"}`}
                      </span>
                      <span>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</span>
                    </div>
                    {m.subject ? <div className="mt-0.5 text-xs font-medium">{m.subject}</div> : null}
                    {m.snippet ? <div className="mt-1 text-xs text-muted-foreground">{m.snippet}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




function PerryApprovalPanel({ c }: { c: CreatorRow }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Approval state">
        <div className="mb-3">
          <span className={`inline-flex rounded px-2 py-1 text-sm font-medium ${perryTone(c.perryApproval)}`}>{c.perryApproval}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Perry sets strategy and provides final sign-off before samples ship or affiliate terms are confirmed. Rena does not proceed to shipping or affiliate confirmation without an approval here.
        </p>
      </Card>
      <Card title="Perry's comments">
        {c.perryComments ? <p className="whitespace-pre-wrap text-sm">{c.perryComments}</p> : <p className="text-sm text-muted-foreground">No comments recorded yet.</p>}
      </Card>
    </div>
  );
}

function RawFields({ c }: { c: CreatorRow }) {
  const rows: [string, string | null][] = [
    ["Creator ID", c.id], ["Creator", c.name], ["Segment", c.segment], ["Primary Platforms", c.primaryPlatforms],
    ["Primary Source", c.primarySource], ["Reach / Location Signal", c.reachSignal], ["Verified Public Email", c.email],
    ["Official Contact Route", c.contactRoute], ["Contact Confidence", c.contactConfidence], ["Research Status", c.researchStatus],
    ["Priority", c.priority], ["Amazon", c.amazon], ["Research Notes / Next Check", c.researchNotes], ["Last Researched", c.lastResearched],
    ["Seth Next Action", c.sethNextAction], ["Outreach Owner", c.outreachOwner], ["Perry Comments", c.perryComments],
    ["Amazon Confidence", c.amazonConfidence], ["Monetization", c.monetization], ["Verification Evidence", c.verificationEvidence],
    ["Contacted Date", c.contactedDate], ["Contact Method", c.contactMethod], ["Response / Follow-up", c.responseFollowup],
    ["Sample Status", c.sampleStatus], ["Rena Notes", c.renaNotes], ["Tuan Affiliate Status", c.tuanAffiliateStatus],
    ["Creator Code / Link", c.creatorCode], ["Technical Notes", c.technicalNotes], ["Recent Activity Check", c.recentActivityCheck],
    ["Full Verification Result", c.fullVerification], ["Verification Evidence / Date", c.verificationDate],
    ["Current Followers / Reach Signal", c.followersSignal], ["Main Target Audience", c.targetAudience],
    ["Likely Audience Geography", c.geography], ["Geography Confidence", c.geographyConfidence],
    ["Facebook URL", c.facebook], ["Instagram URL", c.instagram], ["TikTok URL", c.tiktok], ["YouTube URL", c.youtube],
    ["Other Platform + URL", c.otherPlatform], ["Recommended Offer", c.recommendedOffer],
    ["Estimated Partnership Tier", c.partnershipTier], ["Offer Confidence", c.offerConfidence], ["Offer Reasoning", c.offerReasoning],
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="w-64 bg-secondary/40 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">{k}</td>
              <td className="whitespace-pre-wrap px-3 py-2 text-sm">{v ?? <span className="text-muted-foreground">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <section className={`rounded-lg border border-border bg-card p-4 ${full ? "md:col-span-2" : ""}`}>
      <h3 className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function KV({ k, v, mono, link }: { k: string; v: string | null | undefined; mono?: boolean; link?: boolean }) {
  return (
    <div className="mb-1.5 grid grid-cols-[140px_1fr] gap-2 text-sm">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className={mono ? "font-mono text-xs" : ""}>
        {v ? (
          link ? (
            <a {...externalLinkProps(v)} className="text-primary hover:underline">{v}</a>
          ) : (
            v
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function PlatformLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      {...externalLinkProps(url)}
      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-secondary"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// ---------- Positive-reply nudge ----------
// Lightweight intent prompt shown after a creator replies but before we've
// captured a shipping address. Non-mutating — jumps to the right tab so the
// operator confirms next steps explicitly.
function PositiveReplyNudge({ c, onJump }: { c: CreatorRow; onJump: (t: Tab) => void }) {
  const ws = useWorkspace(c);
  if (!ws.responded) return null;
  if (ws.publishDate || ws.contentReceived) return null; // already progressed past

  const hasAnyAddress =
    !!(ws.shippingAddress1 || ws.shippingCity || ws.shippingPostalCode || ws.addressReceived);
  const suggestion = !hasAnyAddress
    ? {
        headline: "Positive reply — request the shipping address next.",
        detail:
          "The creator has responded. Draft a short reply asking for the shipping name, address and phone, or open the Shipping tab if you already have it.",
      }
    : ws.sampleShipped
      ? null
      : {
          headline: "Address on file — ready to ship the sample.",
          detail: "Confirm carrier and tracking in the Shipping tab, then send a shipping-notification email from Communications.",
        };
  if (!suggestion) return null;

  return (
    <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 text-sm text-emerald-900">
          <Heart className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{suggestion.headline}</div>
            <div className="text-xs text-emerald-800">{suggestion.detail}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => onJump("communications")}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
          >
            Draft reply
          </button>
          <button
            onClick={() => onJump("shipping")}
            className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          >
            Open Shipping
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------- Relationship panel (consolidated: assignment + Perry approval) ----------
function RelationshipPanel({ c }: { c: CreatorRow }) {
  return (
    <div className="grid gap-6">
      <AssignmentPanel c={c} />
      <OutreachPanel c={c} />
      <PerryApprovalPanel c={c} />
    </div>
  );
}

function reviewTone(s: ReviewStatus): string {
  switch (s) {
    case "Flagged for Second Look": return "bg-amber-100 text-amber-900 border-amber-300";
    case "Approved to Send":        return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "Skip":                    return "bg-red-100 text-red-800 border-red-300";
    default:                        return "bg-secondary text-secondary-foreground border-border";
  }
}

function ReviewAndImportantBar({ c }: { c: CreatorRow }) {
  const ws = useWorkspace(c);
  const status = ws.reviewStatus ?? "Not Reviewed";
  const flagged = !!ws.importantFlag;
  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Flag className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Review</span>
          <div className="flex flex-wrap gap-1">
            {REVIEW_STATUSES.map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  onClick={() => updateWorkspace(c.id, { reviewStatus: s })}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                    active ? reviewTone(s) : "border-input text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ml-auto flex flex-1 items-center gap-2 md:flex-none">
          <button
            onClick={() => updateWorkspace(c.id, { importantFlag: !flagged })}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
              flagged
                ? "border-amber-400 bg-amber-100 text-amber-900"
                : "border-input text-muted-foreground hover:bg-secondary"
            }`}
            aria-pressed={flagged}
            title="Mark as important / follow up (personal bookmark)"
          >
            <Star className={`h-3.5 w-3.5 ${flagged ? "fill-current" : ""}`} />
            {flagged ? "Important" : "Mark important"}
          </button>
          {flagged ? (
            <input
              value={ws.importantNote ?? ""}
              onChange={(e) => updateWorkspace(c.id, { importantNote: e.target.value })}
              placeholder="Short reason (optional)"
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs md:w-64"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
