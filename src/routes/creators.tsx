import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CREATORS,
  isOverdue,
  isReadyForOutreach,
  needsPerryApproval,
  priorityTone,
  ownerTone,
  perryTone,
  sampleTone,
  responseTone,
  amazonStatus,
  amazonTone,
  SHEET_HEADERS,
  type CreatorRow,
  type OutreachOwner,
  type AmazonStatus,
  useCreatorsVersion,
} from "@/lib/creator-partnerships";
import { useDashboardCounts, getWorkspace, isWaitingForReply, isTestCreatorId } from "@/lib/creator-workspace";
import { useTestCreators, testCreatorToRow } from "@/lib/test-creators";
import { useCurrentTeamMember } from "@/lib/current-team-member";
import { PageHeader } from "@/components/PageHeader";
import { PersonalizedDashboard } from "@/components/creators/PersonalizedDashboard";
import { ExternalLink, Search, Download, AlertCircle, Clock, Mail, Truck, ShieldCheck, Users, CalendarClock, Package, Handshake, Beaker, Sparkles, DollarSign, TrendingUp, Flag, Star, FileDown } from "lucide-react";
import { ResearchDrawer } from "@/components/creators/ResearchDrawer";
import { rollupRoi } from "@/lib/creator-workspace";
import { exportCreatorsCsv, exportShippingCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/creators")({
  component: CreatorsLayout,
  head: () => ({
    meta: [
      { title: "Creator Partnerships — Survival Tabs Hub" },
      { name: "description", content: "Rena-led outreach CRM for Survival Tabs creator partnerships: assignments, follow-ups, shipping, and Perry approvals." },
      { property: "og:title", content: "Creator Partnerships — Survival Tabs Hub" },
      { property: "og:description", content: "Rena-led outreach CRM: assignments, follow-ups, shipping, and Perry approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CreatorsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/creators") return <Outlet />;
  return <CreatorsList />;
}

type QueueKey = "all" | "rena" | "waiting" | "overdue" | "perry" | "shipping" | "ready" | "second_look" | "important";

const QUEUES: { key: QueueKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all", label: "All creators", icon: Search },
  { key: "ready", label: "Ready for outreach", icon: Mail },
  { key: "second_look", label: "Flagged for Second Look", icon: Flag },
  { key: "important", label: "Flagged Important", icon: Star },
  { key: "rena", label: "Rena queue", icon: Mail },
  { key: "waiting", label: "Waiting for reply", icon: Clock },
  { key: "overdue", label: "Overdue follow-ups", icon: AlertCircle },
  { key: "perry", label: "Needs Perry approval", icon: ShieldCheck },
  { key: "shipping", label: "Shipping", icon: Truck },
];

function CreatorsList() {
  const ops = useDashboardCounts();
  const member = useCurrentTeamMember();
  const [q, setQ] = useState("");
  const [queue, setQueue] = useState<QueueKey>("all");
  const [ownerFilter, setOwnerFilter] = useState<"All" | "RENA" | "Unassigned">(
    member.id === "RENA" ? member.id : "All",
  );
  const [amazonFilter, setAmazonFilter] = useState<"All" | AmazonStatus>("All");
  const [showImport, setShowImport] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const testCreators = useTestCreators();

  const creatorsVersion = useCreatorsVersion();
  const allCreators = useMemo(() => {
    const testRows = testCreators.map(testCreatorToRow);
    return [...testRows, ...CREATORS];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testCreators, creatorsVersion]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allCreators.filter((c) => {
      const ws = getWorkspace(c);
      if (queue === "rena" && c.outreachOwner !== "RENA") return false;
      if (queue === "waiting" && !isWaitingForReply(c, ws)) return false;
      if (queue === "overdue" && !isOverdue(c)) return false;
      if (queue === "perry" && !needsPerryApproval(c)) return false;
      if (queue === "shipping" && !["Awaiting Address", "Address Received", "Shipped", "Delivered"].includes(c.normalizedSampleStatus)) return false;
      if (queue === "ready" && !isReadyForOutreach(c)) return false;
      if (queue === "second_look" && ws.reviewStatus !== "Flagged for Second Look") return false;
      if (queue === "important" && !ws.importantFlag) return false;
      if (ownerFilter === "RENA" && c.outreachOwner !== "RENA") return false;
      if (ownerFilter === "Unassigned" && c.outreachOwner !== null) return false;
      const amazon = amazonStatus(c.amazon);
      if (amazonFilter !== "All" && amazon !== amazonFilter) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.segment ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle) ||
        c.id.toLowerCase().includes(needle) ||
        amazon.toLowerCase().includes(needle)
      );
    });
  }, [allCreators, q, queue, ownerFilter, amazonFilter]);

  const counts = useMemo(() => ({
    total: allCreators.length,
    rena: allCreators.filter((c) => c.outreachOwner === "RENA").length,
    waiting: ops.waiting,
    overdue: allCreators.filter(isOverdue).length,
    perry: allCreators.filter(needsPerryApproval).length,
    shipping: allCreators.filter((c) =>
      ["Awaiting Address", "Address Received", "Shipped", "Delivered"].includes(c.normalizedSampleStatus)
    ).length,
    ready: allCreators.filter(isReadyForOutreach).length,
    second_look: allCreators.filter((c) => getWorkspace(c).reviewStatus === "Flagged for Second Look").length,
    important: allCreators.filter((c) => getWorkspace(c).importantFlag).length,
  }), [allCreators, ops.waiting]);
  const roi = useMemo(() => rollupRoi(), [allCreators]);

  return (
    <div>
      <PageHeader
        eyebrow="CRM · Rena supervises & executes"
        title="Creator Partnerships"
        description="Live mirror of the Survival Tabs Influencer Operating System — 250 creators, real sheet columns, assignment queues, outreach history, shipping, and Perry approval."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowResearch(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-3.5 w-3.5" /> Research new creator
            </button>
            <button
              onClick={() => exportCreatorsCsv(filtered, `creators-${queue}`)}
              disabled={filtered.length === 0}
              title="Download the rows currently shown (queue + filters + search) as CSV"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" /> Export CSV ({filtered.length})
            </button>
            <button
              onClick={() => exportShippingCsv(filtered)}
              disabled={filtered.length === 0}
              title="Shipping-only columns for pick & pack"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Truck className="h-3.5 w-3.5" /> Export shipping list
            </button>
            <button
              onClick={() => setShowImport((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary"
            >
              <Download className="h-3.5 w-3.5" /> Import from Google Sheet
            </button>
          </div>
        }
      />

      <ResearchDrawer open={showResearch} onClose={() => setShowResearch(false)} />
      <PersonalizedDashboard />

      <section className="mb-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--gold)]">Operations dashboard</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <OpsCard icon={<Mail className="h-3.5 w-3.5" />} label="Ready for outreach" value={ops.readyForOutreach} tone="ready" />
          <OpsCard icon={<Users className="h-3.5 w-3.5" />} label="Assigned to Rena" value={ops.rena} />
          <OpsCard icon={<Clock className="h-3.5 w-3.5" />} label="Waiting for reply" value={ops.waiting} tone="warn" />
          <OpsCard icon={<CalendarClock className="h-3.5 w-3.5" />} label="Follow-up due today" value={ops.followUpDueToday} tone="alert" />
          <OpsCard icon={<Package className="h-3.5 w-3.5" />} label="Sample pending" value={ops.samplePending} />
          <OpsCard icon={<Handshake className="h-3.5 w-3.5" />} label="Active partnerships" value={ops.activePartnerships} tone="ready" />
          <OpsCard icon={<DollarSign className="h-3.5 w-3.5" />} label="Total spend" value={Math.round(roi.totalSpend)} />
          <OpsCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Avg ROI %" value={roi.avgRoi === null ? 0 : Math.round(roi.avgRoi * 100)} tone={roi.avgRoi && roi.avgRoi >= 1 ? "ready" : undefined} />
        </div>
      </section>

      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <SummaryCard label="Total" value={counts.total} />
        <SummaryCard label="Ready for outreach" value={counts.ready} tone="ready" />
        <SummaryCard label="Rena" value={counts.rena} />
        <SummaryCard label="Waiting reply" value={counts.waiting} tone="warn" />
        <SummaryCard label="Overdue" value={counts.overdue} tone="alert" />
        <SummaryCard label="Perry approval" value={counts.perry} tone="warn" />
        <SummaryCard label="In shipping" value={counts.shipping} />
      </section>

      {showImport ? <ImportPanel onClose={() => setShowImport(false)} /> : null}

      <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {QUEUES.map((q0) => {
          const active = queue === q0.key;
          const Icon = q0.icon;
          const n = (counts as any)[q0.key === "all" ? "total" : q0.key];
          return (
            <button
              key={q0.key}
              onClick={() => {
                setQueue(q0.key);
                if (q0.key === "rena" && ownerFilter !== "RENA") setOwnerFilter("All");
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {q0.label}
              <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-secondary"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search creator, segment, email, ST-INF-###…"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase tracking-wider">Owner</span>
          <select
            value={ownerFilter}
            onChange={(e) => {
              const v = e.target.value as "All" | "RENA" | "Unassigned";
              setOwnerFilter(v);
              if (v === "Unassigned" && queue === "rena") setQueue("all");
            }}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="All">All</option>
            <option value="RENA">Rena</option>
            <option value="Unassigned">Unassigned</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase tracking-wider">Amazon</span>
          <select
            value={amazonFilter}
            onChange={(e) => setAmazonFilter(e.target.value as "All" | AmazonStatus)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="All">All</option>
            <option value="Yes">✅ Yes</option>
            <option value="No">❌ No</option>
            <option value="Unknown">❓ Unknown</option>
          </select>
        </label>
        <div className="text-xs text-muted-foreground">
          Showing {filtered.length} of {CREATORS.length}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[1300px] text-sm">
          <thead className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Creator</th>
              <th className="px-3 py-3 font-medium">Priority</th>
              <th className="px-3 py-3 font-medium">Amazon</th>
              <th className="px-3 py-3 font-medium">Owner</th>
              <th className="px-3 py-3 font-medium">Perry</th>
              <th className="px-3 py-3 font-medium">Contact</th>
              <th className="px-3 py-3 font-medium">Response</th>
              <th className="px-3 py-3 font-medium">Sample</th>
              <th className="px-3 py-3 font-medium">Next follow-up</th>
              <th className="px-3 py-3 font-medium">Route</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <Row key={c.id} c={c} />
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No creators match this queue.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Supervisor: <strong>Rena</strong> across all rows. Owner column reflects the current relationship owner (Rena) as recorded in the master sheet.
      </p>
    </div>
  );
}

function Row({ c }: { c: CreatorRow }) {
  const overdue = isOverdue(c);
  return (
    <tr className="align-top hover:bg-secondary/40">
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <Link to="/creators/$id" params={{ id: c.id }} className="font-medium hover:text-primary">
            {c.name}
          </Link>
          {isTestCreatorId(c.id, c.name) ? (
            <span className="inline-flex rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
              Test
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">{c.id} · {c.segment ?? "—"}</div>
        {c.followersSignal ? <div className="text-[11px] text-muted-foreground">{c.followersSignal}</div> : null}
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex rounded px-2 py-0.5 text-[11px] ${priorityTone(c.priority)}`}>
          {c.priority ?? "—"}
        </span>
      </td>
      <td className="px-3 py-3">
        <AmazonBadge amazon={c.amazon} />
      </td>
      <td className="px-3 py-3">
        <OwnerBadge o={c.outreachOwner} />
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex rounded px-2 py-0.5 text-[11px] ${perryTone(c.perryApproval)}`}>
          {c.perryApproval}
        </span>
      </td>
      <td className="px-3 py-3 text-xs">
        {c.contactedDate ? (
          <>
            <div>{c.contactedDate}</div>
            <div className="text-[11px] text-muted-foreground">{c.contactMethod ?? "—"}</div>
          </>
        ) : (
          <span className="text-muted-foreground">Not contacted</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex rounded px-2 py-0.5 text-[11px] ${responseTone(c.responseState)}`}>
          {c.responseState}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex rounded px-2 py-0.5 text-[11px] ${sampleTone(c.normalizedSampleStatus)}`}>
          {c.normalizedSampleStatus}
        </span>
      </td>
      <td className="px-3 py-3 text-xs">
        {c.nextFollowUpDate ? (
          <span className={overdue ? "font-semibold text-red-700" : ""}>
            {c.nextFollowUpDate}
            {overdue ? " · OVERDUE" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {c.contactRoute ? (
          <a
            href={c.contactRoute}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function OwnerBadge({ o }: { o: OutreachOwner }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${ownerTone(o)}`}>
      {o ?? "Unassigned"}
    </span>
  );
}

function AmazonBadge({ amazon }: { amazon: string | null }) {
  const status = amazonStatus(amazon);
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${amazonTone(status)}`}>
      {status === "Yes" ? "✅ Yes" : status === "No" ? "❌ No" : "❓ Unknown"}
    </span>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "warn" | "alert" | "ready" }) {
  const border =
    tone === "alert" ? "border-red-300 bg-red-50/50" : tone === "warn" ? "border-amber-300 bg-amber-50/50" : tone === "ready" ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <div className="font-display text-2xl leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function OpsCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "warn" | "alert" | "ready" }) {
  const border =
    tone === "alert" ? "border-red-300 bg-red-50/50" : tone === "warn" ? "border-amber-300 bg-amber-50/50" : tone === "ready" ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="font-display text-2xl leading-none text-foreground">{value}</div>
    </div>
  );
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ rows: number; missing: string[] } | null>(null);

  const parse = () => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return setResult({ rows: 0, missing: SHEET_HEADERS });
    const headers = lines[0].split("\t").length > 1 ? lines[0].split("\t") : lines[0].split(",");
    const cleaned = headers.map((h) => h.trim().replace(/^"|"$/g, ""));
    const missing = SHEET_HEADERS.filter((h) => !cleaned.includes(h));
    setResult({ rows: lines.length - 1, missing });
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg">Import from Google Sheet</h3>
          <p className="text-xs text-muted-foreground">
            Paste rows (tab-separated from Google Sheets, or CSV). We validate against the exact 44-column Master Database headers.
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Paste including the header row.\nFirst row must contain: " + SHEET_HEADERS.slice(0, 6).join(", ") + ", …"}
        className="h-32 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={parse}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Validate paste
        </button>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Show expected 44 headers</summary>
          <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {SHEET_HEADERS.map((h, i) => (
              <li key={h}>{i + 1}. {h}</li>
            ))}
          </ol>
        </details>
      </div>
      {result ? (
        <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs">
          <div><strong>{result.rows}</strong> data rows detected.</div>
          {result.missing.length ? (
            <div className="mt-1 text-red-700">
              Missing headers ({result.missing.length}): {result.missing.join(", ")}
            </div>
          ) : (
            <div className="mt-1 text-emerald-700">✓ All 44 headers present — ready to import (backend hookup pending).</div>
          )}
        </div>
      ) : null}
    </div>
  );
}