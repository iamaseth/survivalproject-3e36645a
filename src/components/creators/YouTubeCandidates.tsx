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

function daysSinceUpload(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function candidatePriority(c: YouTubeCandidate) {
  const subs = c.subscriber_count;
  const email = !!(c.business_email || c.description_email);
  const contactable = email || (c.external_links?.length ?? 0) > 0;
  const days = daysSinceUpload(c.last_upload_at);
  let score = 0;

  if (subs == null) score += 0;
  else if (subs > 20000) score -= 100;
  else if (subs >= 1000 && subs <= 10000) score += 8;
  else if (subs > 10000) score += 6;
  else score += 5;

  if (email) score += 6;
  else if (contactable) score += 3;

  if (days != null) {
    if (days <= 90) score += 5;
    else if (days <= 180) score += 2;
    else if (days > 365) score -= 3;
  }

  if (c.topic_keyword) score += 2;
  return score;
}

function sizeBand(subs: number | null) {
  if (subs == null) return "Size unknown";
  if (subs < 1000) return "Nano · promising";
  if (subs <= 5000) return "Very high priority";
  if (subs <= 10000) return "Very high priority";
  if (subs <= 20000) return "High priority";
  return "Over 20K · exclude";
}

export function PipelineCounters({ counts }: { counts: PipelineCounts | null }) {
  const items: Array<[string, string]> = counts
    ? [
        ["Live creators", String(counts.liveCreators)],
        ["≤20k subs", String(counts.under20k)],
        ["With public email", String(counts.withEmail)],
        ["Missing email", String(counts.missingEmail)],
        ["Pending candidates", String(counts.pendingCandidates)],
        ["Need enrichment", String(counts.enrichmentPending)],
        ["Usable contacts", `${counts.usableEmails} / ${counts.goal}`],
        ["Still needed", String(counts.remainingToGoal)],
      ]
    : [];
  if (!counts) return null;
  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">1,000 Creator Goal</div>
          <div className="text-sm text-muted-foreground">Primary campaign: relevant, active creators with 20,000 followers/subscribers or less. No minimum follower count.</div>
        </div>
        <div className="font-display text-2xl text-foreground">{counts.progressPercent}%</div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="font-display text-xl text-foreground">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary" style={{ width: `${counts.progressPercent}%` }} />
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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pending = useMemo(
    () => rows.filter((r) => r.status === "pending").sort((a, b) => candidatePriority(b) - candidatePriority(a)),
    [rows],
  );

  const recommended = useMemo(
    () => pending.filter((c) => {
      const subs = c.subscriber_count;
      const contactable = !!(c.business_email || c.description_email) || (c.external_links?.length ?? 0) > 0;
      const days = daysSinceUpload(c.last_upload_at);
      return subs != null && subs <= 20000 && contactable && (days == null || days <= 180);
    }),
    [pending],
  );

  useEffect(() => {
    const pendingIds = new Set(pending.map((c) => c.id));
    setSelectedIds((current) => new Set([...current].filter((id) => pendingIds.has(id))));
  }, [pending]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectRecommended = () => setSelectedIds(new Set(recommended.map((c) => c.id)));
  const clearSelected = () => setSelectedIds(new Set());

  const keepSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    let created = 0;
    let linked = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          const res = (await keep({ data: { id } })) as { creatorId: string; created: boolean };
          if (res.created) created += 1; else linked += 1;
        } catch {
          failed += 1;
        }
      }
      setSelectedIds(new Set());
      await refresh();
      toast.success(`Kept ${created + linked} candidate(s): ${created} added, ${linked} linked${failed ? `, ${failed} failed` : ""}.`);
    } finally {
      setBulkBusy(false);
    }
  };

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
          <div className="text-xs text-muted-foreground">Ranked for Survival Tabs: ≤20K first, 1K–10K highest priority, active channels and legitimate public contact paths favored.</div>
        </div>
      </button>
      {open ? (
        <div className="border-t border-border">
          {pending.length ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/20 px-4 py-3">
              <button type="button" onClick={selectRecommended} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-secondary">
                Select recommended ≤20K ({recommended.length})
              </button>
              <button type="button" onClick={clearSelected} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-secondary">Clear</button>
              <button
                type="button"
                disabled={bulkBusy || selectedIds.size === 0}
                onClick={() => void keepSelected()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {bulkBusy ? "Keeping…" : `Keep selected (${selectedIds.size})`}
              </button>
              <span className="text-xs text-muted-foreground">Add-only: existing creators are preserved and duplicates are linked instead of recreated.</span>
            </div>
          ) : null}
          {pending.length === 0 ? <div className="px-4 py-5 text-sm text-muted-foreground">No candidates waiting for review.</div> : null}
          {pending.length > 0 ? (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-secondary/45 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-12 px-4 py-3">Select</th>
                    <th className="min-w-[220px] px-3 py-3">Creator</th>
                    <th className="w-[100px] px-3 py-3 text-right">Subscribers</th>
                    <th className="w-[90px] px-3 py-3 text-right">Videos</th>
                    <th className="w-[80px] px-3 py-3">Country</th>
                    <th className="min-w-[190px] px-3 py-3">Niche / Description</th>
                    <th className="w-[115px] px-3 py-3">Last Upload</th>
                    <th className="min-w-[155px] px-3 py-3">Priority</th>
                    <th className="min-w-[125px] px-3 py-3">Recommendation</th>
                    <th className="min-w-[220px] px-3 py-3">Contact</th>
                    <th className="min-w-[150px] px-3 py-3">Status</th>
                    <th className="w-[95px] px-3 py-3">Channel</th>
                    <th className="w-[160px] px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((c) => {
                    const email = c.business_email || c.description_email;
                    const url = c.channel_url || `https://www.youtube.com/channel/${c.channel_id}`;
                    const days = daysSinceUpload(c.last_upload_at);
                    const overLimit = c.subscriber_count != null && c.subscriber_count > 20000;
                    const enrichmentLabel =
                      c.enrichment_status === "found"
                        ? "Enriched"
                        : c.enrichment_status === "no_email_found"
                          ? "Checked — no email"
                          : c.enrichment_status === "error"
                            ? "Enrichment error"
                            : "Needs enrichment";
                    const isRecommended = recommended.some((r) => r.id === c.id);

                    return (
                      <tr key={c.id} className="border-b border-border/60 align-middle hover:bg-secondary/25">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            disabled={overLimit}
                            aria-label={`Select ${c.channel_title || c.channel_id}`}
                            className="h-4 w-4 rounded border-input"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="max-w-[260px] font-medium text-foreground">{c.channel_title || c.channel_id}</div>
                          <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-muted-foreground">{c.channel_id}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums">{fmt(c.subscriber_count)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{c.video_count ?? "—"}</td>
                        <td className="px-3 py-3">{c.country || "—"}</td>
                        <td className="px-3 py-3">
                          <div className="max-w-[220px] whitespace-normal text-foreground">{c.topic_keyword || "—"}</div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">{days == null ? "Unknown" : `${days}d ago`}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {sizeBand(c.subscriber_count)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {isRecommended ? (
                            <span className="inline-flex rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Recommended</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="max-w-[230px] break-all text-foreground">{email || "No public email yet"}</div>
                          {c.email_source ? <div className="mt-0.5 text-[11px] text-muted-foreground">{c.email_source}</div> : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">{enrichmentLabel}</div>
                          {c.enrichment_error ? <div className="mt-0.5 max-w-[190px] truncate text-[11px] text-destructive">{c.enrichment_error}</div> : null}
                        </td>
                        <td className="px-3 py-3">
                          <a {...externalLinkProps(url)} className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-secondary">
                            <Youtube className="h-3.5 w-3.5" /> Open
                          </a>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button disabled={overLimit || busy === c.id || bulkBusy} onClick={() => void act(c.id, "keep")} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                              <Check className="h-3.5 w-3.5" /> Keep
                            </button>
                            <button disabled={busy === c.id || bulkBusy} onClick={() => void act(c.id, "skip")} className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs disabled:opacity-50">
                              <X className="h-3.5 w-3.5" /> Skip
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
