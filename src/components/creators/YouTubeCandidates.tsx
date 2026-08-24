import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Check, X, Youtube, Mail } from "lucide-react";
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
  if (subs <= 5000) return "Very high";
  if (subs <= 10000) return "Very high";
  if (subs <= 20000) return "High";
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
        <div className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--gold)] text-xs font-semibold text-[color:var(--forest)]">R</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            Candidates — research before adding <span className="ml-1 text-sm font-normal text-muted-foreground">({pending.length})</span>
          </div>
          <div className="text-xs text-muted-foreground">Not yet in the main creator list. Review the YouTube channel and contact details. Keep = add to main creators. Skip = unsuitable. Leave here if more research is needed.</div>
        </div>
      </button>
      {open ? (
        <div className="border-t border-border">
          {pending.length ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/20 px-3 py-2">
              <button type="button" onClick={selectRecommended} className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-secondary">
                Select recommended ({recommended.length})
              </button>
              <button type="button" onClick={clearSelected} className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-secondary">Clear</button>
              <button
                type="button"
                disabled={bulkBusy || selectedIds.size === 0}
                onClick={() => void keepSelected()}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {bulkBusy ? "Keeping…" : `Keep (${selectedIds.size})`}
              </button>
              <span className="text-[11px] text-muted-foreground">Add-only; duplicates link to existing creators.</span>
            </div>
          ) : null}
          {pending.length === 0 ? <div className="px-4 py-5 text-sm text-muted-foreground">No candidates waiting for review.</div> : null}
          {pending.length > 0 ? (
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed border-collapse text-xs">
                <colgroup>
                  <col className="w-[3%]" />
                  <col className="w-[27%]" />
                  <col className="w-[8%]" />
                  <col className="w-[7%]" />
                  <col className="w-[6%]" />
                  <col className="w-[9%]" />
                  <col className="w-[14%]" />
                  <col className="w-[7%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-secondary/45 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-1 py-2" aria-label="Select" />
                    <th className="px-2 py-2">Creator / niche</th>
                    <th className="px-2 py-2 text-right">Subs</th>
                    <th className="px-2 py-2 text-right">Videos</th>
                    <th className="px-2 py-2">Country</th>
                    <th className="px-2 py-2">Last upload</th>
                    <th className="px-2 py-2">Priority</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Actions</th>
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
                          ? "No email"
                          : c.enrichment_status === "error"
                            ? "Error"
                            : "Needs enrichment";
                    const isRecommended = recommended.some((r) => r.id === c.id);

                    return (
                      <tr key={c.id} className="border-b border-border/60 align-middle hover:bg-secondary/25">
                        <td className="px-1 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            disabled={overLimit}
                            aria-label={`Select ${c.channel_title || c.channel_id}`}
                            className="h-3.5 w-3.5 rounded border-input"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <div className="min-w-0 truncate font-medium text-foreground" title={c.channel_title || c.channel_id}>{c.channel_title || c.channel_id}</div>
                            <a {...externalLinkProps(url)} title="Open YouTube channel for research" aria-label={`Open ${c.channel_title || c.channel_id} on YouTube`} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-input hover:bg-secondary">
                              <Youtube className="h-3.5 w-3.5" />
                            </a>
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={c.topic_keyword || ""}>{c.topic_keyword || "—"}</div>
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums">{fmt(c.subscriber_count)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.video_count ?? "—"}</td>
                        <td className="px-2 py-2 truncate" title={c.country || ""}>{c.country || "—"}</td>
                        <td className="px-2 py-2 whitespace-nowrap tabular-nums">{days == null ? "Unknown" : `${days}d`}</td>
                        <td className="px-2 py-2">
                          <div className="truncate font-medium" title={sizeBand(c.subscriber_count)}>{sizeBand(c.subscriber_count)}</div>
                          {isRecommended ? <div className="text-[10px] font-medium text-primary">Recommended</div> : null}
                        </td>
                        <td className="px-2 py-2">
                          {email ? (
                            <a href={`mailto:${email}`} title={email} aria-label={`Email ${c.channel_title || c.channel_id}`} className="inline-flex h-7 items-center gap-1 rounded border border-input px-2 hover:bg-secondary">
                              <Mail className="h-3.5 w-3.5" /> Email
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground" title={enrichmentLabel}>{enrichmentLabel}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button title="Keep candidate" aria-label="Keep candidate" disabled={overLimit || busy === c.id || bulkBusy} onClick={() => void act(c.id, "keep")} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground disabled:opacity-50">
                              <Check className="h-3 w-3" /> Keep
                            </button>
                            <button title="Skip candidate" aria-label="Skip candidate" disabled={busy === c.id || bulkBusy} onClick={() => void act(c.id, "skip")} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input disabled:opacity-50">
                              <X className="h-3.5 w-3.5" />
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
