import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Users,
  FileText,
  Video as VideoIcon,
  Megaphone,
  Send,
  FolderKanban,
  BarChart3,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";

import { assets, decisions, tasks, STATUS_ORDER } from "@/lib/mock-data";
import { guides } from "@/lib/knowledge-data";
import { CREATORS, useCreatorsVersion } from "@/lib/creator-partnerships";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentTeamMember } from "@/lib/current-team-member";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Promotion OS — Survival Tabs" },
      {
        name: "description",
        content:
          "Plan, produce, promote and measure Survival Tabs brand activity across influencers, content, video and campaigns in one place.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Promotion OS — Survival Tabs" },
      {
        property: "og:description",
        content: "One operating system for planning, producing, promoting and measuring brand activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const MODULES = [
  {
    to: "/creators",
    label: "Influencers",
    icon: Users,
    purpose: "Discovery, qualification and partnership workflow for creators.",
    state: "Live",
  },
  {
    to: "/content",
    label: "Content",
    icon: FileText,
    purpose: "Library of produced posts, articles and creator deliverables.",
    state: "Staged",
  },
  {
    to: "/video",
    label: "Video",
    icon: VideoIcon,
    purpose: "Scripts, storyboards, shot lists and finished cuts.",
    state: "Live",
  },
  {
    to: "/campaigns",
    label: "Campaigns",
    icon: Megaphone,
    purpose: "Plan and track compensated collaborations and launches.",
    state: "Staged",
  },
  {
    to: "/creators/outreach",
    label: "Outreach",
    icon: Send,
    purpose: "Bulk sequences, reply triage and messaging templates.",
    state: "Live",
  },
  {
    to: "/assets",
    label: "Assets",
    icon: FolderKanban,
    purpose: "Every asset routed through review and approval.",
    state: "Live",
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    purpose: "Performance reporting across promotion activity.",
    state: "Staged",
  },
  {
    to: "/preparedness-book",
    label: "Preparedness Book",
    icon: BookOpen,
    purpose: "Chapters, review status and launch assets for the book.",
    state: "Staged",
  },
] as const;

function Dashboard() {
  const member = useCurrentTeamMember();
  const navigate = useNavigate();
  useCreatorsVersion();

  useEffect(() => {
    if (member.id === "RENA" || member.id === "VINA") {
      navigate({ to: "/creators", replace: true });
    }
  }, [member.id, navigate]);

  const inReview = assets.filter((a) => a.status === "Ready for Boss Review");
  const openTasks = tasks.filter((t) => t.status !== "Done");
  const statusCounts = STATUS_ORDER.map((s) => ({ s, n: assets.filter((a) => a.status === s).length })).filter(
    (r) => r.n > 0,
  );
  const recent = [...assets]
    .flatMap((a) => a.activity.map((ac) => ({ ...ac, asset: a })))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 6);

  const overview: { label: string; value: string; note: string }[] = [
    { label: "Influencers tracked", value: String(CREATORS.length), note: "Live from the influencer workspace" },
    { label: "Assets in the hub", value: String(assets.length), note: `${inReview.length} awaiting review` },
    { label: "Knowledge guides", value: String(guides.length), note: `${guides.filter((g) => g.status === "Published").length} published` },
    { label: "Campaign performance", value: "—", note: "Not connected yet" },
  ];

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Promotion OS"
        title="Survival Tabs"
        description="Plan, produce, promote and measure everything the brand puts into the world — one place for influencers, content, video, campaigns and reporting."
      />

      {/* Modules */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Modules</h2>
          <span className="text-xs text-muted-foreground">Survival Tabs · active brand</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.label}
                to={m.to}
                className="group flex min-h-[180px] flex-col justify-between rounded-xl border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-secondary text-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {m.state}
                    </span>
                  </div>
                  <div className="mt-4 font-display text-xl leading-tight text-foreground">{m.label}</div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{m.purpose}</p>
                </div>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Promotion overview */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Promotion overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overview.map((o) => (
            <div key={o.label} className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{o.label}</div>
              <div className="mt-2 font-display text-3xl text-foreground">{o.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{o.note}</div>
            </div>
          ))}
        </div>
        {statusCounts.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {statusCounts.map(({ s, n }) => (
              <span
                key={s}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
              >
                {s} · <span className="font-medium text-foreground">{n}</span>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {/* Current work / needs attention */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Current work &amp; needs attention
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="font-display text-lg">Awaiting review</h3>
              <Link to="/review" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {inReview.slice(0, 5).map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <Link to="/assets/$id" params={{ id: a.id }} className="line-clamp-1 text-sm font-medium hover:text-primary">
                    {a.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted-foreground">{a.category}</div>
                </li>
              ))}
              {inReview.length === 0 ? (
                <li className="px-5 py-6 text-sm text-muted-foreground">Nothing waiting on review.</li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="font-display text-lg">Decisions needed</h3>
              <Link to="/decisions" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {decisions.slice(0, 5).map((d) => (
                <li key={d.id} className="px-5 py-3">
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Owner: {d.owner}</div>
                </li>
              ))}
              {decisions.length === 0 ? (
                <li className="px-5 py-6 text-sm text-muted-foreground">No open decisions.</li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="font-display text-lg">Open tasks</h3>
              <Link to="/team-actions" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {openTasks.slice(0, 5).map((t) => (
                <li key={t.id} className="px-5 py-3">
                  <div className="line-clamp-2 text-sm font-medium">{t.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{t.status}</div>
                </li>
              ))}
              {openTasks.length === 0 ? (
                <li className="px-5 py-6 text-sm text-muted-foreground">No open tasks.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Recent activity
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {recent.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-5 py-3 text-sm">
              {r.verb.includes("approved") ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="text-foreground">
                  <span className="font-medium">{r.actor}</span> {r.verb}{" "}
                  <Link to="/assets/$id" params={{ id: r.asset.id }} className="hover:text-primary">
                    {r.asset.title}
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground">{r.at}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
