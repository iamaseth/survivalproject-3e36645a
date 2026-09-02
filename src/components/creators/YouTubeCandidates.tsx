import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Check, X, Youtube, Mail, Download, Upload } from "lucide-react";
import {
  listYouTubeCandidates,
  keepYouTubeCandidate,
  skipYouTubeCandidate,
  getPipelineCounts,
  applyReviewedCandidateEnrichmentBatch,
  type YouTubeCandidate,
  type PipelineCounts,
  type ReviewedCandidateEnrichment,
} from "@/lib/youtube-candidates.functions";
import {
  setYouTubeCandidateClassification,
  type CandidateClassification,
} from "@/lib/youtube-candidate-classification.functions";
import { externalLinkProps, survivalTabsOutreachUrl } from "@/lib/external-link";

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
  if (subs <= 10000) return "Very high";
  if (subs <= 20000) return "High";
  return "Over 20K · exclude";
}

function candidateClassification(c: YouTubeCandidate): CandidateClassification {
  const marker = (Array.isArray(c.external_links) ? c.external_links : []).find(
    (item) => item?.kind === "research_classification",
  );
  const value = marker?.source as CandidateClassification | undefined;
  return value && ["creator", "brand_company", "competitor", "organization", "needs_review"].includes(value)
    ? value
    : "needs_review";
}

function classificationLabel(value: CandidateClassification) {
  switch (value) {
    case "creator": return "Creator";
    case "brand_company": return "Brand / company";
    case "competitor": return "Competitor";
    case "organization": return "Organization";
    default: return "Needs review";
  }
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeClassification(raw: string | null): CandidateClassification | null {
  const value = (raw || "").trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (["creator", "influencer", "independent_creator"].includes(value)) return "creator";
  if (["brand", "company", "brand_company", "business"].includes(value)) return "brand_company";
  if (["competitor", "direct_competitor"].includes(value)) return "competitor";
  if (["organization", "government", "agency", "nonprofit", "ngo"].includes(value)) return "organization";
  if (["needs_review", "review", "unclear", "unknown"].includes(value)) return "needs_review";
  return null;
}

function researchRowsFromCsv(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV has no research rows.");
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name.toLowerCase());
  const idCol = col("Candidate ID");
  if (idCol < 0) throw new Error("CSV must include a Candidate ID column.");
  const read = (row: string[], name: string) => {
    const index = col(name);
    return index >= 0 ? row[index] || null : null;
  };

  return rows.slice(1).map((row) => ({
    enrichment: {
      id: row[idCol]?.trim() || "",
      email: read(row, "Perplexity Email"),
      emailSource: read(row, "Email Source URL"),
      website: read(row, "Website"),
      instagram: read(row, "Instagram"),
      tiktok: read(row, "TikTok"),
      facebook: read(row, "Facebook"),
      amazonStorefront: read(row, "Amazon Storefront"),
      otherLinks: read(row, "Other Useful Links"),
    } satisfies ReviewedCandidateEnrichment,
    classification: normalizeClassification(read(row, "Classification")),
  })).filter((row) => row.enrichment.id);
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
      // No access: counters stay hidden.
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
  const applyEnrichment = useServerFn(applyReviewedCandidateEnrichmentBatch);
  const setClassification = useServerFn(setYouTubeCandidateClassification);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pending = useMemo(
    () => rows.filter((r) => r.status === "pending").sort((a, b) => candidatePriority(b) - candidatePriority(a)),
    [rows],
  );

  // Read-only audit totals. These make previously processed rows visible in
  // the UI without changing or restoring any candidate status.
  const workflowStatusCounts = useMemo(() => ({
    stored: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    kept: rows.filter((r) => r.status === "kept").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    other: rows.filter((r) => !["pending", "kept", "skipped"].includes(r.status)).length,
  }), [rows]);

  const classificationCounts = useMemo(() => {
    const result = { creator: 0, brand_company: 0, competitor: 0, organization: 0, needs_review: 0 };
    for (const c of pending) result[candidateClassification(c)] += 1;
    return result;
  }, [pending]);

  const recommended = useMemo(
    () => pending.filter((c) => {
      if (candidateClassification(c) !== "creator") return false;
      const subs = c.subscriber_count;
      const contactable = !!(c.business_email || c.description_email) || (c.external_links?.some((item) => item?.url) ?? false);
      const days = daysSinceUpload(c.last_upload_at);
      return subs != null && subs <= 20000 && contactable && (days == null || days <= 180);
    }),
    [pending],
  );

  useEffect(() => {
    const selectableIds = new Set(recommended.map((c) => c.id));
    setSelectedIds((current) => new Set([...current].filter((id) => selectableIds.has(id))));
  }, [recommended]);

  const toggleSelected = (id: string) => {
    if (!recommended.some((c) => c.id === id)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectRecommended = () => setSelectedIds(new Set(recommended.map((c) => c.id)));
  const clearSelected = () => setSelectedIds(new Set());

  const changeClassification = async (id: string, classification: CandidateClassification) => {
    setClassifyingId(id);
    try {
      await setClassification({ data: { id, classification } });
      await refresh();
      toast.success(`Classified as ${classificationLabel(classification)}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setClassifyingId(null);
    }
  };

  const downloadResearchCsv = () => {
    const headers = [
      "Candidate ID", "Creator Name", "YouTube URL", "Subscribers", "Videos", "Country", "Niche", "Last Upload",
      "Existing Email", "Known Links", "Perplexity Email", "Email Source URL", "Website", "Instagram", "TikTok", "Facebook",
      "Amazon Storefront", "Other Useful Links", "Research Notes", "Confidence", "Classification",
    ];
    const lines = [headers.map(csvCell).join(",")];
    for (const c of pending) {
      const knownLinks = (Array.isArray(c.external_links) ? c.external_links : [])
        .filter((item) => item?.kind !== "research_classification")
        .flatMap((item) => Object.values(item || {}))
        .filter((value): value is string => typeof value === "string" && /^https?:/i.test(value))
        .join(" | ");
      lines.push([
        c.id,
        c.channel_title || c.channel_id,
        c.channel_url || `https://www.youtube.com/channel/${c.channel_id}`,
        c.subscriber_count ?? "",
        c.video_count ?? "",
        c.country || "",
        c.topic_keyword || "",
        c.last_upload_at || "",
        c.business_email || c.description_email || "",
        knownLinks,
        "", "", "", "", "", "", "", "", "", "",
        candidateClassification(c) === "needs_review" ? "" : classificationLabel(candidateClassification(c)),
      ].map(csvCell).join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `survival-tabs-perplexity-research-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    toast.success(`Downloaded ${pending.length} candidate(s) for research.`);
  };

  const uploadResearchCsv = async (file: File | undefined) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const parsed = researchRowsFromCsv(await file.text());
      if (!parsed.length) throw new Error("No Candidate IDs were found in the CSV.");
      const totals = { received: 0, updated: 0, missing: 0, emailAdded: 0, emailConflict: 0, linksAdded: 0, classified: 0 };

      for (let start = 0; start < parsed.length; start += 100) {
        const enrichmentRows = parsed.slice(start, start + 100).map((item) => item.enrichment);
        const result = (await applyEnrichment({ data: { rows: enrichmentRows } })) as Omit<typeof totals, "classified">;
        totals.received += result.received ?? 0;
        totals.updated += result.updated ?? 0;
        totals.missing += result.missing ?? 0;
        totals.emailAdded += result.emailAdded ?? 0;
        totals.emailConflict += result.emailConflict ?? 0;
        totals.linksAdded += result.linksAdded ?? 0;
      }

      for (const item of parsed) {
        if (!item.classification) continue;
        await setClassification({ data: { id: item.enrichment.id, classification: item.classification } });
        totals.classified += 1;
      }

      await refresh();
      toast.success(`Research import complete: ${totals.updated} enriched, ${totals.classified} classified, ${totals.emailAdded} email(s) added, ${totals.linksAdded} link(s) added, ${totals.emailConflict} email conflict(s), ${totals.missing} unmatched.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research import failed");
    } finally {
      setImportBusy(false);
    }
  };

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
    const candidate = pending.find((c) => c.id === id);
    if (action === "keep" && candidate && candidateClassification(candidate) !== "creator") {
      toast.error("Classify this record as Creator before adding it to the main creator list.");
      return;
    }
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
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--gold)] text-xs font-semibold text-[color:var(--forest)]">R</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            Candidates — research before adding <span className="ml-1 text-sm font-normal text-muted-foreground">({workflowStatusCounts.stored} stored)</span>
          </div>
          <div className="text-xs text-muted-foreground">Classify first. Only records explicitly classified as Creator can be recommended or added to the main creator list.</div>
        </div>
        <span className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground">{open ? "Close" : "Open"}</span>
      </button>
      {open ? (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <span className="font-semibold">Candidate status audit:</span>
            <span className="rounded-md border border-amber-300 bg-white px-2 py-1">Needs research {workflowStatusCounts.pending}</span>
            <span className="rounded-md border border-amber-300 bg-white px-2 py-1">Already added {workflowStatusCounts.kept}</span>
            <span className="rounded-md border border-amber-300 bg-white px-2 py-1">Previously skipped {workflowStatusCounts.skipped}</span>
            {workflowStatusCounts.other ? <span className="rounded-md border border-amber-300 bg-white px-2 py-1">Other status {workflowStatusCounts.other}</span> : null}
            <span className="text-amber-800">Read-only totals; no records were changed.</span>
          </div>
          {pending.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/20 px-3 py-2">
                <span className="rounded-md border border-input bg-background px-2 py-1 text-xs">Creators {classificationCounts.creator}</span>
                <span className="rounded-md border border-input bg-background px-2 py-1 text-xs">Needs review {classificationCounts.needs_review}</span>
                <span className="rounded-md border border-input bg-background px-2 py-1 text-xs">Brands {classificationCounts.brand_company}</span>
                <span className="rounded-md border border-input bg-background px-2 py-1 text-xs">Competitors {classificationCounts.competitor}</span>
                <span className="rounded-md border border-input bg-background px-2 py-1 text-xs">Organizations {classificationCounts.organization}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/20 px-3 py-2">
                <button type="button" onClick={selectRecommended} className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-secondary">
                  Select recommended creators ({recommended.length})
                </button>
                <button type="button" onClick={clearSelected} className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-secondary">Clear</button>
                <button
                  type="button"
                  disabled={bulkBusy || importBusy || selectedIds.size === 0}
                  onClick={() => void keepSelected()}
                  className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {bulkBusy ? "Keeping…" : `Keep (${selectedIds.size})`}
                </button>
                <button type="button" onClick={downloadResearchCsv} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-secondary" title="Download pending candidates for research">
                  <Download className="h-3.5 w-3.5" /> Download research CSV
                </button>
                <label className={`inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-secondary ${importBusy ? "pointer-events-none opacity-50" : "cursor-pointer"}`} title="Upload completed research. Add-only: existing emails are not replaced.">
                  <Upload className="h-3.5 w-3.5" /> {importBusy ? "Importing…" : "Upload enrichment CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={importBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void uploadResearchCsv(file);
                    }}
                  />
                </label>
                <span className="text-[11px] text-muted-foreground">Research import is add-only. Classification does not Keep, Skip, delete, or overwrite existing emails.</span>
              </div>
            </>
          ) : null}

          {pending.length === 0 ? <div className="px-4 py-5 text-sm text-muted-foreground">No candidates currently marked “Needs research.” Check the status audit above before restoring anything.</div> : null}

          {pending.length > 0 ? (
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed border-collapse text-xs">
                <colgroup>
                  <col className="w-[3%]" />
                  <col className="w-[23%]" />
                  <col className="w-[7%]" />
                  <col className="w-[6%]" />
                  <col className="w-[5%]" />
                  <col className="w-[8%]" />
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                  <col className="w-[7%]" />
                  <col className="w-[7%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-secondary/45 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-1 py-2" aria-label="Select" />
                    <th className="px-2 py-2">Creator / niche</th>
                    <th className="px-2 py-2 text-right">Subs</th>
                    <th className="px-2 py-2 text-right">Videos</th>
                    <th className="px-2 py-2">Country</th>
                    <th className="px-2 py-2">Upload</th>
                    <th className="px-2 py-2">Priority</th>
                    <th className="px-2 py-2">Classification</th>
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
                    const classification = candidateClassification(c);
                    const isRecommended = recommended.some((r) => r.id === c.id);
                    const enrichmentLabel =
                      c.enrichment_status === "found"
                        ? "Enriched"
                        : c.enrichment_status === "no_email_found"
                          ? "No email"
                          : c.enrichment_status === "error"
                            ? "Error"
                            : "Needs enrichment";

                    return (
                      <tr key={c.id} className="border-b border-border/60 align-middle hover:bg-secondary/25">
                        <td className="px-1 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            disabled={!isRecommended || overLimit}
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
                          <select
                            value={classification}
                            disabled={classifyingId === c.id || importBusy || bulkBusy}
                            onChange={(e) => void changeClassification(c.id, e.target.value as CandidateClassification)}
                            className="h-7 w-full rounded border border-input bg-background px-1 text-[10px]"
                            aria-label={`Classify ${c.channel_title || c.channel_id}`}
                          >
                            <option value="needs_review">Needs review</option>
                            <option value="creator">Creator</option>
                            <option value="brand_company">Brand / company</option>
                            <option value="competitor">Competitor</option>
                            <option value="organization">Organization</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          {email ? (
                            <a {...externalLinkProps(survivalTabsOutreachUrl(email, c.channel_title || c.channel_id))} title={`Open Outlook for ${email}. Attach the approved product photo before sending.`} aria-label={`Email ${c.channel_title || c.channel_id} in Outlook; attach product photo`} className="inline-flex h-7 items-center gap-1 rounded border border-input px-2 hover:bg-secondary">
                              <Mail className="h-3.5 w-3.5" /> Email · attach photo
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2">
                          <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground" title={enrichmentLabel}>{enrichmentLabel}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button title={classification === "creator" ? "Keep candidate" : "Classify as Creator before keeping"} aria-label="Keep candidate" disabled={classification !== "creator" || overLimit || busy === c.id || bulkBusy || importBusy} onClick={() => void act(c.id, "keep")} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground disabled:opacity-50">
                              <Check className="h-3 w-3" /> Keep
                            </button>
                            <button title="Skip candidate" aria-label="Skip candidate" disabled={busy === c.id || bulkBusy || importBusy} onClick={() => void act(c.id, "skip")} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input disabled:opacity-50">
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
