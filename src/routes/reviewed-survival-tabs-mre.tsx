import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ExternalLink, Mail, Search, Youtube } from "lucide-react";
import { externalLinkProps } from "@/lib/external-link";
import { listReviewedCreators, updateReviewedCreatorWorkflow } from "@/lib/reviewed-creators.functions";

export const Route = createFileRoute("/reviewed-survival-tabs-mre")({
  component: ReviewedSurvivalTabsMre,
  head: () => ({ meta: [{ title: "Reviewed Survival Tabs and MRE — Survival Tabs" }] }),
});

type StageKey = "not_contacted" | "contacted" | "follow_up" | "responded" | "sample";
type Row = Record<string, any>;

const STAGES: Array<{ key: StageKey; step: number; label: string; hint: string }> = [
  { key: "not_contacted", step: 1, label: "Not contacted", hint: "Pick a verified reviewer and send the first message." },
  { key: "contacted", step: 2, label: "Contacted / waiting", hint: "Waiting for a reply." },
  { key: "follow_up", step: 3, label: "Follow up", hint: "No reply after 5 days." },
  { key: "responded", step: 4, label: "Responded", hint: "Handle the response and move interested creators to sample." },
  { key: "sample", step: 5, label: "Sample", hint: "Track address, shipping and delivery." },
];

function daysSince(date: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function responseState(row: Row) {
  const v = String(row.response_followup ?? "").toLowerCase();
  if (v.includes("declin")) return "Declined";
  if (v.includes("interest") || v.includes("replied — interested")) return "Interested";
  return "Waiting";
}

function sampleState(row: Row) {
  return String(row.sample_status ?? "").trim() || "Not Sent";
}

function stageFor(row: Row): StageKey {
  const sample = sampleState(row);
  if (sample !== "Not Sent" && sample !== "Refused") return "sample";
  const response = responseState(row);
  if (response === "Interested" || response === "Declined") return "responded";
  if (!row.contacted_date) return "not_contacted";
  return (daysSince(row.contacted_date) ?? 0) >= 5 ? "follow_up" : "contacted";
}

function reviewStats(notes: string | null) {
  if (!notes) return { title: null, year: null, views: null };
  return {
    title: notes.match(/Original review:\s*([^|]+)/i)?.[1]?.trim() ?? null,
    year: notes.match(/Published:\s*(\d{4})/i)?.[1] ?? null,
    views: notes.match(/Views(?: in source sheet)?:\s*([^|]+)/i)?.[1]?.trim() ?? null,
  };
}

function ReviewedSurvivalTabsMre() {
  const listFn = useServerFn(listReviewedCreators);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openStages, setOpenStages] = useState<Record<StageKey, boolean>>({ not_contacted: true, contacted: true, follow_up: true, responded: true, sample: true });

  const reload = async () => {
    setLoading(true);
    try {
      const result = await listFn();
      setRows(result.rows ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load reviewed creators");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.followers_signal, r.reach_signal, r.email, r.youtube, r.primary_source, r.instagram, r.facebook, r.tiktok, r.contact_route, r.technical_notes]
      .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  const grouped = useMemo(() => {
    const out: Record<StageKey, Row[]> = { not_contacted: [], contacted: [], follow_up: [], responded: [], sample: [] };
    filtered.forEach((r) => out[stageFor(r)].push(r));
    return out;
  }, [filtered]);

  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Separate verified-review database</div>
      <h1 className="font-display text-3xl text-foreground">Reviewed Survival Tabs and MRE</h1>
      <p className="mt-1 text-sm text-muted-foreground">Verified Survival Tabs/MRE review creators only. This list is separate from the main Creators database. {loading ? "Loading…" : `${rows.length} records.`}</p>
    </div>

    <div className="mb-4 relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reviewer, review, followers, email, social…" className="w-full max-w-xl rounded-md border border-input bg-card py-2.5 pl-9 pr-3 text-sm" />
    </div>

    <div className="space-y-3">{STAGES.map((stage) => <section key={stage.key} className="overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={() => setOpenStages((s) => ({ ...s, [stage.key]: !s[stage.key] }))} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        {openStages[stage.key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{stage.step}</div>
        <div><div className="font-semibold">{stage.label} <span className="text-sm font-normal text-muted-foreground">({grouped[stage.key].length})</span></div><div className="text-xs text-muted-foreground">{stage.hint}</div></div>
      </button>
      {openStages[stage.key] && <div className="border-t border-border">{grouped[stage.key].length === 0 ? <div className="px-4 py-5 text-sm text-muted-foreground">Nothing here.</div> : grouped[stage.key].map((r) => <ReviewerLine key={r.id} row={r} reload={reload} />)}</div>}
    </section>)}</div>
  </div>;
}

function ReviewerLine({ row, reload }: { row: Row; reload: () => Promise<void> }) {
  const updateFn = useServerFn(updateReviewedCreatorWorkflow);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const review = reviewStats(row.technical_notes ?? null);
  const reviewUrl = String(row.primary_source ?? "").startsWith("http") ? row.primary_source : null;
  const days = daysSince(row.contacted_date ?? null);
  const stage = stageFor(row);
  const followers = row.followers_signal || row.reach_signal || "—";
  const response = responseState(row);
  const sample = sampleState(row);

  const update = async (patch: Record<string, any>) => {
    setBusy(true);
    try {
      await updateFn({ data: { id: row.id, ...patch } });
      toast.success("Updated");
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Could not update reviewed creator"); }
    finally { setBusy(false); }
  };

  return <div className="border-b border-border last:border-0">
    <div className="grid items-center gap-3 px-4 py-3 xl:grid-cols-[minmax(170px,1.2fr)_minmax(270px,2fr)_80px_100px_125px_130px_120px_34px]">
      <div className="min-w-0"><div className="truncate font-medium">{row.name}</div><div className="truncate text-xs text-muted-foreground">{followers}</div>{row.youtube && <a {...externalLinkProps(row.youtube)} className="mt-1 inline-flex items-center gap-1 text-xs underline"><Youtube className="h-3 w-3" /> Creator channel</a>}</div>
      <div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Original review</div><div className="truncate text-sm font-medium">{review.title || "Verified review"}</div>{reviewUrl ? <><a {...externalLinkProps(reviewUrl)} className="mt-1 inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs"><Youtube className="h-3.5 w-3.5" /> Original review</a><div className="mt-1 select-all break-all font-mono text-[10px] text-muted-foreground">{reviewUrl}</div></> : <span className="text-xs text-amber-700">Review URL pending</span>}</div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Published</div><div className="font-semibold">{review.year || "—"}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Views</div><div className="font-semibold">{review.views || "—"}</div></div>
      <div>{row.email ? <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"><Mail className="h-3.5 w-3.5" /> Write email</a> : row.contact_route?.startsWith("http") ? <a {...externalLinkProps(row.contact_route)} className="inline-flex items-center gap-1 text-xs underline">Contact <ExternalLink className="h-3 w-3" /></a> : <span className="text-xs text-muted-foreground">No email</span>}</div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</div><div className="text-sm">{response}</div><div className="text-[10px] text-muted-foreground">{days == null ? "Not contacted" : `${days} days`}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sample / next</div><div className="truncate text-sm">{sample !== "Not Sent" ? sample : "—"}</div></div>
      <button onClick={() => setOpen((v) => !v)} className="rounded-md p-1 hover:bg-secondary">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
    </div>

    {open && <div className="border-t border-border bg-secondary/20 px-4 py-4"><div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-1 text-sm"><Detail label="Review URL" value={reviewUrl} link /><Detail label="Channel" value={row.youtube} link /><Detail label="Email" value={row.email} /><Detail label="Instagram" value={row.instagram} link /><Detail label="Facebook" value={row.facebook} link /><Detail label="TikTok" value={row.tiktok} link /><Detail label="Contact" value={row.contact_route} link /></div>
      <div className="space-y-1 text-sm"><Detail label="Review stats" value={row.technical_notes} /><Detail label="Verification" value={row.full_verification || row.verification_evidence} /><Detail label="Contacted" value={row.contacted_date} /><Detail label="Method" value={row.contact_method} /><Detail label="Follow-up" value={row.response_followup} /><Detail label="Notes" value={row.rena_notes || row.research_notes} /></div>
      <div className="flex min-w-[210px] flex-col gap-2">
        {stage === "not_contacted" && <button disabled={busy} onClick={() => update({ contacted_date: new Date().toISOString().slice(0, 10), contact_method: row.email ? "Email" : "DM", response_followup: "Waiting reply" })} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Mark contacted today</button>}
        {(stage === "contacted" || stage === "follow_up") && <><button disabled={busy} onClick={() => update({ contacted_date: new Date().toISOString().slice(0, 10), response_followup: "Follow-up sent — waiting reply" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">Follow-up sent today</button><button disabled={busy} onClick={() => update({ response_followup: "Replied — Interested" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">Interested response</button><button disabled={busy} onClick={() => update({ response_followup: "Replied — Declined" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">Declined response</button></>}
        {stage === "responded" && response === "Interested" && <button disabled={busy} onClick={() => update({ sample_status: "Awaiting Address" })} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Start sample</button>}
        {stage === "sample" && <><button disabled={busy} onClick={() => update({ sample_status: "Address Received" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">Address received</button><button disabled={busy} onClick={() => update({ sample_status: "Shipped" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">Mark shipped</button><button disabled={busy} onClick={() => update({ sample_status: "Delivered" })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">Mark delivered</button></>}
      </div>
    </div></div>}
  </div>;
}

function Detail({ label, value, link = false }: { label: string; value: any; link?: boolean }) {
  if (!value) return null;
  const text = String(value);
  return <div className="flex gap-2"><span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>{link && text.startsWith("http") ? <a {...externalLinkProps(text)} className="break-all underline">{text}</a> : <span className="break-words">{text}</span>}</div>;
}
