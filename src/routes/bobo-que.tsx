import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listWorkflowSection, setInfluencerWorkflowStatus } from "@/lib/influencer-master.functions";

export const Route = createFileRoute("/bobo-que")({
  component: BoboQuickResearch,
  head: () => ({ meta: [{ title: "2. Profile Quick Research — Survival Tabs" }, { name: "robots", content: "noindex" }] }),
});

type Profile = {
  source_id: string;
  display_name: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  workflow_status: string;
};
type Platform = "TikTok" | "YouTube";

function BoboQuickResearch() {
  const fetchSection = useServerFn(listWorkflowSection);
  const saveStage = useServerFn(setInfluencerWorkflowStatus);
  const [platform, setPlatform] = useState<Platform>("TikTok");
  const [rows, setRows] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Read every page from the same exclusive status used by homepage Section 2.
      const all: Profile[] = [];
      let page = 0;
      while (true) {
        const result = await fetchSection({ data: { status: "ai_screened", page } });
        all.push(...(result.rows as Profile[]));
        setTotal(result.count);
        if (all.length >= result.count || result.rows.length === 0) break;
        page += 1;
      }
      setRows(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchSection]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => rows.filter(row => platform === "TikTok" ? Boolean(row.tiktok_url) : Boolean(row.youtube_url)), [rows, platform]);
  const current = visible.find(row => row.source_id === selected) ?? visible[0];
  const profileUrl = current && (platform === "TikTok" ? current.tiktok_url : current.youtube_url);

  const decide = async (status: "approved" | "second_look" | "rejected") => {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveStage({ data: { id: current.source_id, status } });
      if (!result.ok) throw new Error("Decision not confirmed.");
      setRows(prev => prev.filter(row => row.source_id !== current.source_id));
      setSelected(null);
      setTotal(prev => Math.max(0, prev - 1));
      setNotice(`${current.display_name || current.source_id} moved to ${status === "approved" ? "Ready to Contact" : status === "second_look" ? "Second Look" : "Rejected"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-16 sm:p-8">
    <Link to="/" className="text-sm underline">← Influencers</Link>
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">2. Profile Quick Research</h1>
      <p className="text-sm text-muted-foreground">BoBo · ពិនិត្យប្រវត្តិអ្នកបង្កើតមាតិកា · {total} in Profile Research</p>
    </header>
    <div className="flex flex-wrap items-center gap-2">
      {(["TikTok", "YouTube"] as const).map(p => <button key={p} type="button" onClick={() => { setPlatform(p); setSelected(null); }} aria-pressed={platform === p}
        className={`rounded-lg border px-5 py-3 font-semibold ${platform === p ? "bg-primary text-primary-foreground" : "bg-card"}`}>{p}</button>)}
      <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="ml-auto rounded-lg border px-4 py-3">Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border p-3">{notice}</p>}
    {loading ? <p>Loading profiles…</p> : current ? <section className="space-y-4 rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">Current influencer · អ្នកបច្ចុប្បន្ន · {visible.length} remaining on {platform}</p>
      <h2 className="break-words text-2xl font-bold">{current.display_name || current.source_id}</h2>
      {profileUrl && <a href={profileUrl} target="_blank" rel="noopener noreferrer"
        className="block rounded-xl bg-primary px-5 py-5 text-center text-lg font-bold text-primary-foreground">Open {platform} Profile ↗ · បើកប្រវត្តិ</a>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" disabled={busy} onClick={() => void decide("approved")} className="rounded-xl border border-emerald-700 px-4 py-4 font-semibold disabled:opacity-50">Approve · អនុម័ត</button>
        <button type="button" disabled={busy} onClick={() => void decide("second_look")} className="rounded-xl border border-amber-600 px-4 py-4 font-semibold disabled:opacity-50">Second Look · ពិនិត្យម្តងទៀត</button>
        <button type="button" disabled={busy} onClick={() => void decide("rejected")} className="rounded-xl border border-red-700 px-4 py-4 font-semibold disabled:opacity-50">Reject · បដិសេធ</button>
      </div>
      <p className="text-xs text-muted-foreground">A decision saves to the existing CRM and removes this creator from Profile Research. Opening a profile alone does not change its status. Approval here is a workflow-stage decision, not final outreach authorization.</p>
    </section> : <p className="rounded-xl border p-6">No {platform} profiles waiting for research.</p>}
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">All waiting profiles · បញ្ជីទាំងអស់ ({visible.length})</h2>
      <div className="divide-y rounded-xl border">
        {visible.map((row, index) => <button key={row.source_id} type="button" onClick={() => setSelected(row.source_id)}
          className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted ${current?.source_id === row.source_id ? "bg-muted font-semibold" : ""}`}>
          <span className="w-9 shrink-0 text-sm text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate">{row.display_name || row.source_id}</span>
          <span className="text-xs text-muted-foreground">Select ↑</span>
        </button>)}
      </div>
    </section>
  </main>;
}
