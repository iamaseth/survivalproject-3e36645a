import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Check, X, Youtube } from "lucide-react";
import {
  listYouTubeCandidates,
  keepYouTubeCandidate,
  skipYouTubeCandidate,
  getPipelineCounts,
  type YouTubeCandidate,
  type PipelineCounts,
} from "@/lib/youtube-candidates.functions";
import { externalLinkProps } from "@/lib/external-link";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

export function PipelineCounters({ counts }: { counts: PipelineCounts | null }) {
  const items: Array<[string, string]> = counts
    ? [
        ["Live creators", String(counts.liveCreators)],
        ["≤20k subs", String(counts.under20k)],
        ["With public email", String(counts.withEmail)],
        ["Missing email", String(counts.missingEmail)],
        ["Pending candidates", String(counts.pendingCandidates)],
        ["Need enrichment", String(counts.enrichmentPending)],
        ["Usable emails / 1,000", `${counts.usableEmails} / ${counts.goal}`],
      ]
    : [];
  const pct = counts ? Math.min(100, Math.round((counts.usableEmails / counts.goal) * 100)) : 0;
  if (!counts) return null;
  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="font-display text-xl text-foreground">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function useYouTubePipeline() {
  const list = useServerFn(listYouTubeCandidates);
  const counts = useServerFn(getPipelineCounts);
  const [rows, setRows] = useState<YouTubeCandidate[]>([]);
  const [totals, setTotals] = useState<PipelineCounts | null>(null);

  const refresh = async () => {
    try {
      const [r, c] = await Promise.all([list({}), counts({})]);
      setRows(r as YouTubeCandidate[]);
      setTotals(c as PipelineCounts);
    } catch {
      /* not signed in / no access — counters simply stay hidden */
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rows, totals, refresh };
}

export function YouTubeCandidatesSection({
  rows,
  refresh,
}: {
  rows: YouTubeCandidate[];
  refresh: () => void | Promise<void>;
}) {
  const keep = useServerFn(keepYouTubeCandidate);
  const skip = useServerFn(skipYouTubeCandidate);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const pending = useMemo(() => {
    const score = (c: YouTubeCandidate) => {
      const hasEmail = !!(c.business_email || c.description_email);
      const small = c.subscriber_count != null && c.subscriber_count <= 20000;
      return (hasEmail ? 2 : 0) + (small ? 1 : 0);
    };
    return rows.filter((r) => r.status === "pending").sort((a, b) => score(b) - score(a));
  }, [rows]);

  const act = async (id: string, action: "keep" | "skip") => {
    setBusy(id);
    try {
      if (action === "keep") {
        const res = (await keep({ data: { id } })) as { creatorId: string; created: boolean };
        toast.success(res.created ? `Added ${res.creatorId} to creators` : `Linked to existing creator ${res.creatorId}`);
      } else {
        await skip({ data: { id } });
        toast.success("Skipped");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--gold)] text-xs font-semibold text-[color:var(--forest)]">0</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            New YouTube candidates <span className="ml-1 text-sm font-normal text-muted-foreground">({pending.length})</span>
          </div>
          <div className="text-xs text-muted-foreground">YouTube API discovery + public contact enrichment. Keep adds to creators, Skip discards. No email is sent automatically.</div>
        </div>
      </button>
      {open ? (
        <div className="border-t border-border">
          {pending.length === 0 ? <div className="px-4 py-5 text-sm text-muted-foreground">No candidates waiting for review.</div> : null}
          {pending.map((c) => {
            const email = c.business_email || c.description_email;
            const url = c.channel_url || `https://www.youtube.com/channel/${c.channel_id}`;
            const enrichmentLabel =
              c.enrichment_status === "found"
                ? "Enriched"
                : c.enrichment_status === "no_email_found"
                  ? "Checked — no email"
                  : c.enrichment_status === "error"
                    ? "Enrichment error"
                    : "Needs enrichment";
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-3 last:border-b-0">
                <div className="min-w-[200px] flex-1">
                  <div className="truncate font-medium">{c.channel_title || c.channel_id}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {fmt(c.subscriber_count)} subs · {c.video_count ?? "—"} videos{c.country ? ` · ${c.country}` : ""}
                    {c.topic_keyword ? ` · ${c.topic_keyword}` : ""} · {c.source ?? "apps_script"}
                  </div>
                </div>
                <div className="min-w-[210px] text-sm">
                  {email ? <span className="text-foreground">{email}</span> : <span className="text-muted-foreground">No public email yet</span>}
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {c.email_source ? `${c.email_source} · ` : ""}{enrichmentLabel}
                  </div>
                  {c.enrichment_error ? <div className="max-w-[260px] truncate text-[11px] text-destructive">{c.enrichment_error}</div> : null}
                </div>
                <a {...externalLinkProps(url)} className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-secondary">
                  <Youtube className="h-3.5 w-3.5" /> Channel
                </a>
                <div className="flex gap-2">
                  <button disabled={busy === c.id} onClick={() => void act(c.id, "keep")} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" /> Keep
                  </button>
                  <button disabled={busy === c.id} onClick={() => void act(c.id, "skip")} className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs disabled:opacity-50">
                    <X className="h-3.5 w-3.5" /> Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
