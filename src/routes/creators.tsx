import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Mail,
  Search,
  Youtube,
} from "lucide-react";
import {
  CREATORS,
  type CreatorRow,
  useCreatorsVersion,
} from "@/lib/creator-partnerships";
import { updateCreatorWorkflow } from "@/lib/creators.functions";

export const Route = createFileRoute("/creators")({
  component: CreatorsLayout,
  head: () => ({
    meta: [
      { title: "Creators — Survival Tabs" },
      { name: "description", content: "Simple creator outreach workflow." },
    ],
  }),
});

function CreatorsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/creators") return <Outlet />;
  return <CreatorPipeline />;
}

type StageKey = "not_contacted" | "contacted" | "follow_up" | "responded" | "sample";

const STAGES: Array<{ key: StageKey; step: number; label: string; hint: string }> = [
  { key: "not_contacted", step: 1, label: "Not contacted", hint: "Pick a creator and send the first message." },
  { key: "contacted", step: 2, label: "Contacted / waiting", hint: "Waiting for a reply." },
  { key: "follow_up", step: 3, label: "Follow up", hint: "No reply after 5 days." },
  { key: "responded", step: 4, label: "Responded", hint: "Handle the response and move interested creators to sample." },
  { key: "sample", step: 5, label: "Sample", hint: "Track address, shipping and delivery." },
];

function daysSince(date: string | null) {
  if (!date) return null;
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
}

function stageFor(c: CreatorRow): StageKey {
  if (c.normalizedSampleStatus !== "Not Sent" && c.normalizedSampleStatus !== "Refused") return "sample";
  if (c.responseState === "Replied — Interested" || c.responseState === "Replied — Declined") return "responded";
  if (!c.contactedDate) return "not_contacted";
  return (daysSince(c.contactedDate) ?? 0) >= 5 ? "follow_up" : "contacted";
}

function CreatorPipeline() {
  const version = useCreatorsVersion();
  const [query, setQuery] = useState("");
  const [openStages, setOpenStages] = useState<Record<StageKey, boolean>>({
    not_contacted: true,
    contacted: true,
    follow_up: true,
    responded: true,
    sample: true,
  });

  const creators = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = [...CREATORS];
    if (!needle) return rows;
    return rows.filter((c) => [
      c.name, c.followersSignal, c.reachSignal, c.email, c.youtube,
      c.instagram, c.facebook, c.tiktok, c.segment, c.responseFollowup, c.sampleStatus,
    ].some((v) => String(v ?? "").toLowerCase().includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, version]);

  const grouped = useMemo(() => {
    const out: Record<StageKey, CreatorRow[]> = {
      not_contacted: [], contacted: [], follow_up: [], responded: [], sample: [],
    };
    creators.forEach((c) => out[stageFor(c)].push(c));
    return out;
  }, [creators]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div>
          <h1 className="font-display text-3xl text-foreground">Creators</h1>
        </div>
        <Link to="/amazon-creators" className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary">Amazon creators</Link>
      </div>

      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creator, followers, email…"
          className="w-full max-w-xl rounded-md border border-input bg-card py-2.5 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="space-y-3">
        {STAGES.map((stage) => (
          <StageSection
            key={stage.key}
            stage={stage}
            rows={grouped[stage.key]}
            open={openStages[stage.key]}
            toggle={() => setOpenStages((s) => ({ ...s, [stage.key]: !s[stage.key] }))}
          />
        ))}
      </div>
    </div>
  );
}

function StageSection({
  stage, rows, open, toggle,
}: {
  stage: { key: StageKey; step: number; label: string; hint: string };
  rows: CreatorRow[];
  open: boolean;
  toggle: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={toggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{stage.step}</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{stage.label} <span className="ml-1 text-sm font-normal text-muted-foreground">({rows.length})</span></div>
          <div className="text-xs text-muted-foreground">{stage.hint}</div>
        </div>
      </button>

      {open ? (
        <div className="border-t border-border">
          {rows.length === 0 ? <div className="px-4 py-5 text-sm text-muted-foreground">Nothing here.</div> : null}
          {rows.map((creator) => <CreatorLine key={creator.id} creator={creator} />)}
        </div>
      ) : null}
    </section>
  );
}

function CreatorLine({ creator }: { creator: CreatorRow }) {
  const updateFn = useServerFn(updateCreatorWorkflow);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const followers = creator.followersSignal || creator.reachSignal || "—";
  const days = daysSince(creator.contactedDate);
  const stage = stageFor(creator);

  const update = async (patch: any) => {
    setBusy(true);
    try {
      await updateFn({ data: { id: creator.id, ...patch } });
      toast.success("Updated");
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update creator");
    } finally {
      setBusy(false);
    }
  };

  const emailHref = creator.email
    ? `mailto:${creator.email}?subject=${encodeURIComponent("Survival Tabs creator collaboration")}`
    : null;

  return (
    <div className="border-b border-border last:border-0">
      <div className="grid items-center gap-2 px-4 py-3 md:grid-cols-[minmax(190px,1.6fr)_120px_110px_150px_90px_150px_140px_34px]">
        <div className="min-w-0">
          <Link to="/creators/$id" params={{ id: creator.id }} className="block truncate font-medium hover:text-primary hover:underline hover:underline-offset-4">
            {creator.name}
          </Link>
          <div className="truncate text-xs text-muted-foreground">{creator.segment || creator.primaryPlatforms || "Creator"}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Followers</div>
          <div className="font-semibold">{followers}</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {creator.youtube ? (
            <a href={creator.youtube} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary">
              <Youtube className="h-3.5 w-3.5" /> YouTube
            </a>
          ) : <span className="text-xs text-muted-foreground">No YouTube</span>}
        </div>

        <div>
          {emailHref ? (
            <a href={emailHref} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Mail className="h-3.5 w-3.5" /> Write email
            </a>
          ) : creator.contactRoute?.startsWith("http") ? (
            <a href={creator.contactRoute} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">Contact <ExternalLink className="h-3 w-3" /></a>
          ) : <span className="text-xs text-muted-foreground">No email</span>}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Days</div>
          <div>{days == null ? "—" : days}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</div>
          <div className="truncate text-sm">{creator.responseState === "No Response" ? "Waiting" : creator.responseState.replace("Replied — ", "")}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sample / next</div>
          <div className="truncate text-sm">{creator.normalizedSampleStatus !== "Not Sent" ? creator.normalizedSampleStatus : creator.nextFollowUpDate || "—"}</div>
        </div>

        <button onClick={() => setOpen((v) => !v)} className="rounded-md p-1 hover:bg-secondary" aria-label="Quick creator details">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border bg-secondary/20 px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1 text-sm">
              <Detail label="Email" value={creator.email} />
              <Detail label="Instagram" value={creator.instagram} link />
              <Detail label="Facebook" value={creator.facebook} link />
              <Detail label="TikTok" value={creator.tiktok} link />
              <Detail label="YouTube" value={creator.youtube} link />
              <Detail label="Contact route" value={creator.contactRoute} link />
              <Detail label="Contacted" value={creator.contactedDate} />
              <Detail label="Method" value={creator.contactMethod} />
            </div>
            <div className="space-y-1 text-sm">
              <Detail label="Response / follow-up" value={creator.responseFollowup} />
              <Detail label="Sample" value={creator.sampleStatus} />
              <Detail label="Notes" value={creator.renaNotes || creator.researchNotes} />
              <Detail label="Audience" value={creator.targetAudience} />
              <Detail label="Location" value={creator.geography} />
            </div>
            <div className="flex min-w-[210px] flex-col gap-2">
              {stage === "not_contacted" ? (
                <button disabled={busy} onClick={() => update({ contacted_date: new Date().toISOString().slice(0, 10), contact_method: creator.email ? "Email" : "DM", response_followup: "Waiting reply" })} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Mark contacted today</button>
              ) : null}

              {(stage === "contacted" || stage === "follow_up") ? (
                <>
                  <button disabled={busy} onClick={() => update({ contacted_date: new Date().toISOString().slice(0, 10), response_followup: "Follow-up sent — waiting reply" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Follow-up sent today</button>
                  <button disabled={busy} onClick={() => update({ response_followup: "Replied — Interested" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Interested response</button>
                  <button disabled={busy} onClick={() => update({ response_followup: "Replied — Declined" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Declined response</button>
                </>
              ) : null}

              {stage === "responded" && creator.responseState === "Replied — Interested" ? (
                <button disabled={busy} onClick={() => update({ sample_status: "Awaiting Address" })} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Start sample</button>
              ) : null}

              {stage === "sample" ? (
                <>
                  <button disabled={busy} onClick={() => update({ sample_status: "Address Received" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Address received</button>
                  <button disabled={busy} onClick={() => update({ sample_status: "Shipped" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Mark shipped</button>
                  <button disabled={busy} onClick={() => update({ sample_status: "Delivered" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Mark delivered</button>
                </>
              ) : null}

              <Link to="/creators/$id" params={{ id: creator.id }} className="rounded-md border border-input bg-background px-3 py-2 text-center text-sm font-medium hover:bg-secondary">Open full creator record</Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value, link = false }: { label: string; value: string | null; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      {link && value.startsWith("http") ? <a href={value} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">{value}</a> : <span className="break-words">{value}</span>}
    </div>
  );
}
