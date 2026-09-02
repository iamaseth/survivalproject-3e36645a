import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Mail,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Youtube,
} from "lucide-react";
import { addAmazonCreator, listAmazonCreators } from "@/lib/amazon-creators.functions";
import { findAmazonCreators } from "@/lib/amazon-search.functions";
import {
  listAmazonDiscoveryCandidates,
  promoteAmazonDiscoveryCandidate,
  setAmazonDiscoveryStatus,
} from "@/lib/amazon-discovery.functions";
import { updateCreatorWorkflow } from "@/lib/creators.functions";
import { externalLinkProps, survivalTabsOutreachUrl } from "@/lib/external-link";

export const Route = createFileRoute("/amazon-creators")({
  component: AmazonCreatorsPage,
  head: () => ({
    meta: [
      { title: "Amazon Creators — Survival Tabs" },
      { name: "description", content: "Find Amazon creators and run outreach in one simple workflow." },
      { property: "og:title", content: "Amazon Creators — Survival Tabs" },
      { property: "og:description", content: "Find Amazon creators and run outreach in one simple workflow." },
    ],
  }),
});

const DEFAULT_CHIPS = [
  "emergency food",
  "survival food",
  "preparedness",
  "prepper",
  "bug out bag",
  "camping food",
  "food storage",
  "emergency kit",
  "survival gear",
];

type AmazonCreatorRow = {
  id: string;
  name: string;
  segment?: string | null;
  reach_signal?: string | null;
  followers_signal?: string | null;
  email?: string | null;
  contact_route?: string | null;
  youtube?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  amazon_storefront_url?: string | null;
  amazon_video_url?: string | null;
  amazon_discovery_source?: string | null;
  amazon_content_analysis?: string | null;
  contacted_date?: string | null;
  contact_method?: string | null;
  response_followup?: string | null;
  sample_status?: string | null;
  next_follow_up?: string | null;
};

type Candidate = {
  id: string;
  candidate_url: string;
  candidate_type: string;
  creator_name?: string | null;
  source_label: string;
  status: "new" | "review" | "promoted" | "skipped";
};

type StageKey = "found" | "contacted" | "follow_up" | "responded" | "sample";

const STAGES: Array<{ key: StageKey; step: number; label: string; hint: string }> = [
  { key: "found", step: 1, label: "Found / not contacted", hint: "New creators to review and reach out to." },
  { key: "contacted", step: 2, label: "Contacted / waiting", hint: "Waiting for a reply." },
  { key: "follow_up", step: 3, label: "Follow up", hint: "No reply after 5 days." },
  { key: "responded", step: 4, label: "Responded", hint: "Handle replies and move interested creators to sample." },
  { key: "sample", step: 5, label: "Sample / creating content", hint: "Sample sent, content in progress." },
];

function daysSince(date?: string | null) {
  if (!date) return null;
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
}

function stageFor(row: AmazonCreatorRow): StageKey {
  const sample = (row.sample_status ?? "").toLowerCase();
  if (sample && !sample.includes("not sent") && !sample.includes("refused")) return "sample";
  const response = (row.response_followup ?? "").toLowerCase();
  if (response.includes("replied") || response.includes("interested") || response.includes("declined")) return "responded";
  if (!row.contacted_date) return "found";
  return (daysSince(row.contacted_date) ?? 0) >= 5 ? "follow_up" : "contacted";
}

function AmazonCreatorsPage() {
  const listFn = useServerFn(listAmazonCreators);
  const findFn = useServerFn(findAmazonCreators);
  const candidatesFn = useServerFn(listAmazonDiscoveryCandidates);
  const addFn = useServerFn(addAmazonCreator);

  const [rows, setRows] = useState<AmazonCreatorRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [terms, setTerms] = useState<string[]>(DEFAULT_CHIPS.slice(0, 4));
  const [newTerm, setNewTerm] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [openStages, setOpenStages] = useState<Record<StageKey, boolean>>({
    found: true, contacted: true, follow_up: true, responded: true, sample: true,
  });

  const refresh = async () => {
    setLoading(true);
    try {
      const [creators, queue] = await Promise.all([listFn(), candidatesFn()]);
      setRows((creators.rows ?? []) as AmazonCreatorRow[]);
      setCandidates(((queue.rows ?? []) as Candidate[]).filter((c) => c.status === "new" || c.status === "review"));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load Amazon creators");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const find = async () => {
    setFinding(true);
    try {
      const result = await findFn({ data: { keywords: terms, includeSeed: true } });
      if (result.blocked) toast.warning(result.message);
      else if (result.added > 0) toast.success(result.message);
      else toast.info(result.message);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Search failed");
    } finally {
      setFinding(false);
    }
  };

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => [r.name, r.email, r.segment, r.reach_signal, r.youtube, r.amazon_storefront_url]
      .some((v) => String(v ?? "").toLowerCase().includes(needle)));
  }, [rows, query]);

  const grouped = useMemo(() => {
    const out: Record<StageKey, AmazonCreatorRow[]> = { found: [], contacted: [], follow_up: [], responded: [], sample: [] };
    filteredRows.forEach((r) => out[stageFor(r)].push(r));
    return out;
  }, [filteredRows]);

  const toggleTerm = (term: string) =>
    setTerms((current) => current.includes(term) ? current.filter((t) => t !== term) : [...current, term]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Amazon outreach</div>
          <h1 className="font-display text-3xl text-foreground">Amazon Creators</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/creators" className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary">All creators</Link>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary"><Plus className="h-4 w-4" /> Add manually</button>
        </div>
      </div>

      <section className="mb-4 rounded-xl border border-border bg-card p-4">
        <div className="mb-2 font-semibold">Find Amazon creators</div>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([...DEFAULT_CHIPS, ...terms])].map((chip) => (
            <button
              key={chip}
              onClick={() => toggleTerm(chip)}
              className={`rounded-full border px-3 py-1 text-xs ${terms.includes(chip) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-secondary"}`}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTerm.trim()) {
                setTerms((c) => [...new Set([...c, newTerm.trim()])]);
                setNewTerm("");
              }
            }}
            placeholder="Add your own topic and press Enter"
            className="min-w-[240px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={() => void find()}
            disabled={finding || terms.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> {finding ? "Searching…" : "Find Creators"}
          </button>
        </div>
      </section>

      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creator, email, topic…"
          className="w-full max-w-xl rounded-md border border-input bg-card py-2.5 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="space-y-3">
        {STAGES.map((stage) => (
          <StageSection
            key={stage.key}
            stage={stage}
            count={grouped[stage.key].length + (stage.key === "found" ? candidates.length : 0)}
            open={openStages[stage.key]}
            toggle={() => setOpenStages((s) => ({ ...s, [stage.key]: !s[stage.key] }))}
          >
            {stage.key === "found"
              ? candidates.map((candidate) => (
                  <CandidateLine key={candidate.id} candidate={candidate} onDone={refresh} />
                ))
              : null}
            {grouped[stage.key].map((row) => (
              <CreatorLine key={row.id} row={row} stage={stage.key} onDone={refresh} />
            ))}
            {grouped[stage.key].length === 0 && (stage.key !== "found" || candidates.length === 0) ? (
              <div className="px-4 py-5 text-sm text-muted-foreground">{loading ? "Loading…" : "Nothing here."}</div>
            ) : null}
          </StageSection>
        ))}
      </div>

      {addOpen ? <AddDrawer close={() => setAddOpen(false)} addFn={addFn} onDone={refresh} /> : null}
    </div>
  );
}

function StageSection({
  stage, count, open, toggle, children,
}: {
  stage: { key: StageKey; step: number; label: string; hint: string };
  count: number;
  open: boolean;
  toggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={toggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{stage.step}</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{stage.label} <span className="ml-1 text-sm font-normal text-muted-foreground">({count})</span></div>
          <div className="text-xs text-muted-foreground">{stage.hint}</div>
        </div>
      </button>
      {open ? <div className="border-t border-border">{children}</div> : null}
    </section>
  );
}

function labelForCandidate(candidate: Candidate) {
  if (candidate.creator_name) return candidate.creator_name;
  try {
    const path = new URL(candidate.candidate_url).pathname.split("/").filter(Boolean);
    const slug = path.find((part) => !["shop", "live", "video", "influencer", "creator", "profile"].includes(part));
    if (slug && !/^[0-9a-f]{16,}$/i.test(slug)) return decodeURIComponent(slug).replace(/[-_]/g, " ");
  } catch { /* ignore */ }
  return candidate.candidate_type === "storefront" ? "New Amazon storefront" : "New Amazon creator video";
}

function CandidateLine({ candidate, onDone }: { candidate: Candidate; onDone: () => Promise<void> }) {
  const keepFn = useServerFn(promoteAmazonDiscoveryCandidate);
  const skipFn = useServerFn(setAmazonDiscoveryStatus);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-secondary/10 px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium capitalize">{labelForCandidate(candidate)}</div>
        <a href={candidate.candidate_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground underline underline-offset-4">
          Amazon page <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void act(() => keepFn({ data: { id: candidate.id } }), "Added to your creators")} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Keep</button>
        <button disabled={busy} onClick={() => void act(() => skipFn({ data: { id: candidate.id, status: "skipped" } }), "Skipped")} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">Skip</button>
      </div>
    </div>
  );
}

function CreatorLine({ row, stage, onDone }: { row: AmazonCreatorRow; stage: StageKey; onDone: () => Promise<void> }) {
  const updateFn = useServerFn(updateCreatorWorkflow);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = daysSince(row.contacted_date);
  const amazonUrl = row.amazon_storefront_url || row.amazon_video_url;

  const update = async (patch: Record<string, string | null>) => {
    setBusy(true);
    try {
      await updateFn({ data: { id: row.id, ...patch } as any });
      toast.success("Updated");
      await onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update creator");
    } finally {
      setBusy(false);
    }
  };

  const today = () => new Date().toISOString().slice(0, 10);

  return (
    <div className="border-b border-border last:border-0">
      <div className="grid items-center gap-2 px-4 py-3 md:grid-cols-[minmax(180px,1.5fr)_110px_170px_150px_80px_150px_150px_34px]">
        <div className="min-w-0">
          <div className="truncate font-medium">{row.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.segment || "Amazon creator"}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Followers</div>
          <div className="truncate font-semibold">{row.followers_signal || row.reach_signal || "—"}</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {amazonUrl ? (
            <a href={amazonUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"><ShoppingBag className="h-3.5 w-3.5" /> Amazon</a>
          ) : null}
          {row.youtube ? (
            <a href={row.youtube} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"><Youtube className="h-3.5 w-3.5" /> YouTube</a>
          ) : null}
        </div>

        <div>
          {row.email ? (
            <a {...externalLinkProps(survivalTabsOutreachUrl(row.email, row.name))} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Mail className="h-3.5 w-3.5" /> Email in Outlook</a>
          ) : row.contact_route?.startsWith("http") ? (
            <a href={row.contact_route} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">Contact <ExternalLink className="h-3 w-3" /></a>
          ) : <span className="text-xs text-muted-foreground">No email</span>}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Days</div>
          <div>{days == null ? "—" : days}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</div>
          <div className="truncate text-sm">{row.response_followup || (row.contacted_date ? "Waiting" : "—")}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sample / next</div>
          <div className="truncate text-sm">{row.sample_status || row.next_follow_up || "—"}</div>
        </div>

        <button onClick={() => setOpen((v) => !v)} className="rounded-md p-1 hover:bg-secondary" aria-label="Show creator details">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border bg-secondary/20 px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1 text-sm">
              <Detail label="Email" value={row.email} />
              <Detail label="Contact route" value={row.contact_route} />
              <Detail label="Storefront" value={row.amazon_storefront_url} link />
              <Detail label="Amazon video" value={row.amazon_video_url} link />
              <Detail label="Instagram" value={row.instagram} link />
              <Detail label="TikTok" value={row.tiktok} link />
            </div>
            <div className="space-y-1 text-sm">
              <Detail label="Found via" value={row.amazon_discovery_source} />
              <Detail label="Contacted" value={row.contacted_date} />
              <Detail label="Method" value={row.contact_method} />
              <Detail label="Content notes" value={row.amazon_content_analysis} />
            </div>
            <div className="flex min-w-[210px] flex-col gap-2">
              {stage === "found" ? (
                <button disabled={busy} onClick={() => void update({ contacted_date: today(), contact_method: row.email ? "Email" : "DM", response_followup: "Waiting reply" })} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Mark contacted today</button>
              ) : null}
              {stage === "contacted" || stage === "follow_up" ? (
                <>
                  <button disabled={busy} onClick={() => void update({ contacted_date: today(), response_followup: "Follow-up sent — waiting reply" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Follow-up sent today</button>
                  <button disabled={busy} onClick={() => void update({ response_followup: "Replied — Interested" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Interested response</button>
                  <button disabled={busy} onClick={() => void update({ response_followup: "Replied — Declined" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Declined response</button>
                </>
              ) : null}
              {stage === "responded" ? (
                <button disabled={busy} onClick={() => void update({ sample_status: "Awaiting Address" })} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Start sample</button>
              ) : null}
              {stage === "sample" ? (
                <>
                  <button disabled={busy} onClick={() => void update({ sample_status: "Shipped" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Mark shipped</button>
                  <button disabled={busy} onClick={() => void update({ sample_status: "Delivered" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Mark delivered</button>
                </>
              ) : null}
              <Link to="/creators/$id" params={{ id: row.id }} className="text-center text-xs text-muted-foreground underline underline-offset-4">Full details</Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value, link = false }: { label: string; value?: string | null; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      {link && value.startsWith("http")
        ? <a href={value} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">{value}</a>
        : <span className="break-words">{value}</span>}
    </div>
  );
}

function AddDrawer({
  close, addFn, onDone,
}: {
  close: () => void;
  addFn: (args: { data: any }) => Promise<any>;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [amazon, setAmazon] = useState("");
  const [email, setEmail] = useState("");
  const [youtube, setYoutube] = useState("");
  const [reach, setReach] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Creator name is required"); return; }
    if (!amazon.trim()) { toast.error("Add the Amazon link"); return; }
    setBusy(true);
    try {
      const isVideo = amazon.includes("/live/") || amazon.includes("/video");
      const result = await addFn({ data: {
        name: name.trim(),
        amazon_video_url: isVideo ? amazon.trim() : null,
        amazon_storefront_url: isVideo ? null : amazon.trim(),
        email: email.trim() || null,
        youtube: youtube.trim() || null,
        reach_signal: reach.trim() || null,
      } });
      toast.success(result?.created ? "Creator added" : `Already in your list: ${result?.name}`);
      close();
      await onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save creator");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, placeholder = "") => (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex" onClick={close}>
      <div className="flex-1 bg-black/40" />
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Add Amazon creator</h2>
          <button onClick={close} className="text-sm text-muted-foreground">Close</button>
        </div>
        <div className="grid gap-3 p-5">
          {field("Creator name", name, setName)}
          {field("Amazon link", amazon, setAmazon, "https://www.amazon.com/shop/…")}
          {field("Followers / reach", reach, setReach, "e.g. 18K YouTube")}
          {field("Email", email, setEmail)}
          {field("YouTube", youtube, setYoutube)}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={close} className="rounded-md border border-input px-3 py-2 text-sm">Cancel</button>
          <button disabled={busy} onClick={() => void save()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save creator"}</button>
        </div>
      </div>
    </div>
  );
}
