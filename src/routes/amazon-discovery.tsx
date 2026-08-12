import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  listAmazonDiscoveryCandidates,
  runAmazonDiscovery,
  setAmazonDiscoveryStatus,
} from "@/lib/amazon-discovery.functions";

export const Route = createFileRoute("/amazon-discovery")({
  component: AmazonDiscoveryPage,
  head: () => ({ meta: [
    { title: "Amazon Discovery — Survival Tabs Hub" },
    { name: "description", content: "Discover related Amazon creator/video candidates from a seed URL before promotion into the CRM." },
  ] }),
});

const DEFAULT_SEED = "https://www.amazon.com/live/video/03c6133b0f7a41fab0ead7f9c7b30019";

type Candidate = {
  id: string;
  seed_url: string;
  candidate_url: string;
  candidate_type: string;
  creator_name?: string | null;
  source_label: string;
  status: "new" | "review" | "promoted" | "skipped";
  notes?: string | null;
  discovered_at: string;
};

function AmazonDiscoveryPage() {
  const runFn = useServerFn(runAmazonDiscovery);
  const listFn = useServerFn(listAmazonDiscoveryCandidates);
  const statusFn = useServerFn(setAmazonDiscoveryStatus);
  const [seedUrl, setSeedUrl] = useState(DEFAULT_SEED);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await listFn();
      setRows((result.rows ?? []) as Candidate[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load discovery queue");
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const discover = async () => {
    setBusy(true);
    try {
      const result = await runFn({ data: { seedUrl } });
      if (result.blocked) toast.warning(result.message);
      else if (result.found > 0) toast.success(result.message);
      else toast.info(result.message);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Discovery failed");
    } finally { setBusy(false); }
  };

  const changeStatus = async (id: string, status: Candidate["status"]) => {
    try {
      await statusFn({ data: { id, status } });
      setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update candidate");
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.candidate_url, row.candidate_type, row.source_label, row.status, row.creator_name]
      .some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [rows, q]);

  const counts = useMemo(() => ({
    all: rows.length,
    fresh: rows.filter((row) => row.status === "new").length,
    review: rows.filter((row) => row.status === "review").length,
    promoted: rows.filter((row) => row.status === "promoted").length,
  }), [rows]);

  return <div>
    <PageHeader
      eyebrow="Amazon · free discovery v1"
      title="Amazon Discovery Queue"
      description="Start from one useful Amazon review or storefront. The free first pass looks for related Amazon videos/storefronts, deduplicates them, and puts candidates into a review queue before anyone is added to outreach."
    />

    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="block text-xs">
          <span className="text-muted-foreground">Amazon seed video or storefront URL</span>
          <input
            value={seedUrl}
            onChange={(e) => setSeedUrl(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={() => void discover()}
          disabled={busy || !seedUrl.trim()}
          className="inline-flex self-end items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy ? "Discovering…" : "Discover related creators"}
        </button>
      </div>
      <div className="mt-3 rounded-md bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
        Cost: $0 for this first pass. Amazon sometimes returns a blocked/limited page to automated requests. When that happens, the app stops rather than repeatedly hammering Amazon; the Crawlee browser fallback in the repo is the next step.
      </div>
    </section>

    <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
      <Metric label="Candidates" value={counts.all} />
      <Metric label="New" value={counts.fresh} />
      <Metric label="Review" value={counts.review} />
      <Metric label="Promoted" value={counts.promoted} />
    </section>

    <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search URL, type, source, status…" className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm" />
      </div>
      <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
    </div>

    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b border-border bg-secondary/40 text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Candidate</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Review action</th></tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Loading discovery queue…</td></tr> : null}
          {!loading && filtered.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No candidates yet. Run discovery from the Survival Tabs reference video above.</td></tr> : null}
          {filtered.map((row) => <tr key={row.id} className="border-b border-border align-top last:border-0">
            <td className="max-w-[440px] px-3 py-3"><a href={row.candidate_url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 break-all underline underline-offset-4">{row.candidate_url}<ExternalLink className="mt-0.5 h-3 w-3 shrink-0" /></a></td>
            <td className="px-3 py-3 text-xs">{row.candidate_type}</td>
            <td className="px-3 py-3 text-xs text-muted-foreground">{row.source_label}</td>
            <td className="px-3 py-3"><Status status={row.status} /></td>
            <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">
              <button onClick={() => void changeStatus(row.id, "review")} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary">Keep for review</button>
              <button onClick={() => void changeStatus(row.id, "skipped")} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary">Skip</button>
              <a href={`/amazon-creators?candidate=${encodeURIComponent(row.candidate_url)}`} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">Open Amazon Creators</a>
            </div></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}

function Status({ status }: { status: Candidate["status"] }) {
  const cls = status === "promoted" ? "bg-emerald-100 text-emerald-800" : status === "skipped" ? "bg-muted text-muted-foreground" : status === "review" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}
