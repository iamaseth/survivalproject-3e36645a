import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, Search, Video, ShoppingBag, Sparkles, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { addAmazonCreator, listAmazonCreators } from "@/lib/amazon-creators.functions";

export const Route = createFileRoute("/amazon-creators")({
  component: AmazonCreatorsPage,
  head: () => ({ meta: [
    { title: "Amazon Creators — Survival Tabs Hub" },
    { name: "description", content: "Discover and qualify Amazon Live and shoppable-video creators for Survival Tabs." },
  ] }),
});

type AmazonCreatorRow = {
  id: string;
  name: string;
  segment?: string | null;
  reach_signal?: string | null;
  email?: string | null;
  contact_route?: string | null;
  youtube?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  amazon_storefront_url?: string | null;
  amazon_video_url?: string | null;
  amazon_discovery_source?: string | null;
  amazon_reviewed_survival_tabs?: boolean | null;
  amazon_shoppable_video?: boolean | null;
  amazon_fit_score?: number | null;
  amazon_content_analysis?: string | null;
};

type Draft = {
  name: string;
  storefront: string;
  video: string;
  source: string;
  reviewed: boolean;
  shoppable: boolean;
  fit: string;
  segment: string;
  reach: string;
  email: string;
  contact: string;
  youtube: string;
  instagram: string;
  tiktok: string;
  analysis: string;
};

const EMPTY: Draft = {
  name: "", storefront: "", video: "", source: "Explore related content",
  reviewed: false, shoppable: true, fit: "", segment: "", reach: "", email: "",
  contact: "", youtube: "", instagram: "", tiktok: "", analysis: "",
};

const REFERENCE_VIDEO = "https://www.amazon.com/live/video/03c6133b0f7a41fab0ead7f9c7b30019";

function AmazonCreatorsPage() {
  const listFn = useServerFn(listAmazonCreators);
  const addFn = useServerFn(addAmazonCreator);
  const [rows, setRows] = useState<AmazonCreatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await listFn();
      setRows((result.rows ?? []) as AmazonCreatorRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load Amazon creators");
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => [r.name, r.segment, r.amazon_discovery_source, r.amazon_content_analysis, r.email]
      .some((v) => String(v ?? "").toLowerCase().includes(needle)));
  }, [rows, q]);

  const counts = useMemo(() => ({
    total: rows.length,
    reviewed: rows.filter((r) => r.amazon_reviewed_survival_tabs).length,
    shoppable: rows.filter((r) => r.amazon_shoppable_video).length,
    highFit: rows.filter((r) => (r.amazon_fit_score ?? 0) >= 75).length,
  }), [rows]);

  const save = async () => {
    if (!draft.name.trim()) { toast.error("Creator name is required"); return; }
    if (!draft.video.trim() && !draft.storefront.trim()) { toast.error("Add the Amazon video or storefront URL"); return; }
    const fit = draft.fit.trim() === "" ? null : Number(draft.fit);
    if (fit != null && (!Number.isFinite(fit) || fit < 0 || fit > 100)) { toast.error("Fit score must be 0–100"); return; }
    setAdding(true);
    try {
      const result = await addFn({ data: {
        name: draft.name.trim(),
        amazon_storefront_url: draft.storefront || null,
        amazon_video_url: draft.video || null,
        amazon_discovery_source: draft.source || "Amazon discovery",
        amazon_reviewed_survival_tabs: draft.reviewed,
        amazon_shoppable_video: draft.shoppable,
        amazon_fit_score: fit,
        amazon_content_analysis: draft.analysis || null,
        segment: draft.segment || null,
        reach_signal: draft.reach || null,
        email: draft.email || null,
        contact_route: draft.contact || null,
        youtube: draft.youtube || null,
        instagram: draft.instagram || null,
        tiktok: draft.tiktok || null,
      } });
      toast.success(result.created ? "Amazon creator added" : `Already in CRM: ${result.name}`);
      setDraft(EMPTY);
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save creator");
    } finally { setAdding(false); }
  };

  return <div>
    <PageHeader
      eyebrow="Creator discovery · Amazon"
      title="Amazon Creators"
      description="Find Amazon Live and shoppable-video creators, capture related-content discoveries, and learn which video formats can be repeated for Survival Tabs."
      actions={<div className="flex flex-wrap gap-2">
        <Link to="/creators" className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary">All creator partnerships</Link>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> Add Amazon creator</button>
      </div>}
    />

    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Reference video</div>
          <h2 className="mt-1 font-medium">Survival Tabs Amazon review that started this discovery channel</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Use the creator's “Explore related content” area as a discovery path. Add each relevant creator here, then enrich their public contact routes and analyze the repeatable video structure.</p>
        </div>
        <a href={REFERENCE_VIDEO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary"><Video className="h-4 w-4" /> Open reference video <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
    </section>

    <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
      <Metric label="Amazon creators" value={counts.total} />
      <Metric label="Reviewed Survival Tabs" value={counts.reviewed} />
      <Metric label="Shoppable video" value={counts.shoppable} />
      <Metric label="Fit score 75+" value={counts.highFit} />
    </section>

    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="relative min-w-[260px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, category, source, notes…" className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm" />
      </div>
      <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
    </div>

    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[1150px] text-sm">
        <thead className="border-b border-border bg-secondary/40 text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Creator</th><th className="px-3 py-2">Amazon</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Survival Tabs</th><th className="px-3 py-2">Fit</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Video intelligence</th><th className="px-3 py-2">CRM</th></tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading Amazon creators…</td></tr> : null}
          {!loading && filtered.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No Amazon creators yet. Start with creators shown under Explore related content.</td></tr> : null}
          {filtered.map((r) => <tr key={r.id} className="border-b border-border align-top last:border-0">
            <td className="px-3 py-3"><div className="font-medium">{r.name}</div><div className="mt-1 text-xs text-muted-foreground">{r.segment || "Category not set"}</div><div className="text-xs text-muted-foreground">{r.reach_signal || "Reach not checked"}</div></td>
            <td className="px-3 py-3"><div className="flex flex-col gap-1">{r.amazon_storefront_url ? <Out href={r.amazon_storefront_url} label="Storefront" /> : null}{r.amazon_video_url ? <Out href={r.amazon_video_url} label="Video" /> : null}{r.amazon_shoppable_video ? <Tag>Shoppable</Tag> : null}</div></td>
            <td className="px-3 py-3 text-xs">{r.amazon_discovery_source || "Amazon"}</td>
            <td className="px-3 py-3">{r.amazon_reviewed_survival_tabs ? <Tag>Reviewed</Tag> : <span className="text-xs text-muted-foreground">Prospect</span>}</td>
            <td className="px-3 py-3"><span className="font-semibold">{r.amazon_fit_score ?? "—"}</span><span className="text-xs text-muted-foreground"> / 100</span></td>
            <td className="px-3 py-3 text-xs"><div>{r.email || r.contact_route || "Not researched"}</div><div className="mt-1 flex gap-2">{r.youtube ? <Out href={r.youtube} label="YouTube" /> : null}{r.instagram ? <Out href={r.instagram} label="IG" /> : null}{r.tiktok ? <Out href={r.tiktok} label="TikTok" /> : null}</div></td>
            <td className="max-w-[320px] px-3 py-3 text-xs leading-relaxed text-muted-foreground">{r.amazon_content_analysis || "Analyze hook → demo → reaction → proof → CTA."}</td>
            <td className="px-3 py-3"><Link to="/creators/$id" params={{ id: r.id }} className="text-xs font-medium underline underline-offset-4">Open creator</Link></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {open ? <AddDrawer draft={draft} setDraft={setDraft} save={save} close={() => setOpen(false)} busy={adding} /> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}
function Tag({ children }: { children: React.ReactNode }) { return <span className="inline-flex w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">{children}</span>; }
function Out({ href, label }: { href: string; label: string }) { return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-4">{label}<ExternalLink className="h-3 w-3" /></a>; }

function AddDrawer({ draft, setDraft, save, close, busy }: { draft: Draft; setDraft: (d: Draft) => void; save: () => void; close: () => void; busy: boolean }) {
  const F = (key: keyof Draft, label: string, placeholder = "") => <label className="block text-xs"><span className="text-muted-foreground">{label}</span><input value={String(draft[key] ?? "")} onChange={(e) => setDraft({ ...draft, [key]: e.target.value } as Draft)} placeholder={placeholder} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" /></label>;
  return <div className="fixed inset-0 z-50 flex" onClick={close}><div className="flex-1 bg-black/40"/><div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-4"><div><div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Amazon discovery</div><h2 className="font-semibold">Add Amazon creator</h2></div><button onClick={close}>Close</button></div>
    <div className="grid gap-3 p-5 md:grid-cols-2">
      {F("name", "Creator name *", "Creator display name")}{F("source", "Discovery source", "Explore related content")}
      {F("storefront", "Amazon storefront URL", "https://www.amazon.com/shop/...")}{F("video", "Amazon Live / video URL", REFERENCE_VIDEO)}
      {F("segment", "Content category", "Preparedness · food · camping")}{F("reach", "Reach / followers", "e.g. 18K YouTube")}
      {F("fit", "Survival Tabs fit score (0–100)", "85")}{F("email", "Public business email", "")}
      {F("contact", "Best public contact route", "Instagram DM / website form")}{F("youtube", "YouTube URL", "")}
      {F("instagram", "Instagram URL", "")}{F("tiktok", "TikTok URL", "")}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.reviewed} onChange={(e) => setDraft({ ...draft, reviewed: e.target.checked })}/> Already reviewed Survival Tabs</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.shoppable} onChange={(e) => setDraft({ ...draft, shoppable: e.target.checked })}/> Amazon Live / shoppable-video creator</label>
      <label className="md:col-span-2 block text-xs"><span className="text-muted-foreground">Video intelligence / notes</span><textarea rows={6} value={draft.analysis} onChange={(e) => setDraft({ ...draft, analysis: e.target.value })} placeholder="Hook; problem framed; product demonstration; taste/reaction; benefits mentioned; objections; CTA; setting; video length; what we should repeat in future Survival Tabs creator briefs." className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" /></label>
    </div>
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background px-5 py-3"><button onClick={close} className="rounded-md border border-input px-3 py-2 text-sm">Cancel</button><button disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><ShoppingBag className="h-4 w-4" />{busy ? "Saving…" : "Save Amazon creator"}</button></div>
  </div></div>;
}
