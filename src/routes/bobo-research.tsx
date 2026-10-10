import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBoboProfileTracking, markBoboProfileTracking } from "@/lib/bobo-tiktok.functions";
import { CREATORS, useCreatorsVersion } from "@/lib/creator-partnerships";

export const Route = createFileRoute("/bobo-research")({ component: BoboResearch });
type Progress = Record<string, "saved" | "skipped">;
const KEY = "survival-tabs-bobo-research-progress-v1";
function BoboResearch() {
  useCreatorsVersion();
  const loadTracking = useServerFn(getBoboProfileTracking);
  const saveTracking = useServerFn(markBoboProfileTracking);
  const [opened, setOpened] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [syncError, setSyncError] = useState("");
  useEffect(() => { void loadTracking().then(r => { setOpened(r.opened); setCompleted(r.completed); setTotal(r.total); }).catch(e => setSyncError(String(e))); }, []);
  async function track(id: string, action: "opened" | "completed" | "skipped") {
    try { await saveTracking({ data: { id, action } });
      setOpened(v => [...new Set([...v, id])]);
      if (action !== "opened") setCompleted(v => [...new Set([...v, id])]);
    } catch (e) { setSyncError("Could not save progress: " + String(e)); }
  }
  const [progress, setProgress] = useState<Progress>({});
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setProgress(JSON.parse(raw)); } catch {}
    setLoaded(true);
  }, []);
  const candidates = useMemo(() => CREATORS.filter(c =>
    Boolean(c.tiktok) && (showAll || (c.sethApprovalStatus !== "approved" && c.sethApprovalStatus !== "rejected"))
  ).sort((a,b) => (a.tiktok ?? "").localeCompare(b.tiktok ?? "")), [showAll, CREATORS.length]);
  const pending = candidates.filter(c => !progress[c.id]);
  const current = pending[0];
  const saved = candidates.filter(c => progress[c.id] === "saved").length;
  const skipped = candidates.filter(c => progress[c.id] === "skipped").length;
  function mark(status: "saved" | "skipped") {
    if (!current) return;
    const next = { ...progress, [current.id]: status };
    setProgress(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    void track(current.id, status === "saved" ? "completed" : "skipped");
  }
  function undo() {
    const ids = candidates.filter(c => progress[c.id]).map(c => c.id);
    const last = ids[ids.length - 1];
    if (!last) return;
    const next = { ...progress }; delete next[last];
    setProgress(next); localStorage.setItem(KEY, JSON.stringify(next));
  }
  function exportProgress() {
    const lines = ["creator_id,progress", ...Object.entries(progress).map(([id,status]) => [id,status].map(v=>'"'+v.replaceAll('"','""')+'"').join(","))];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"}));
    a.download = "bobo-research-progress.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  return <div className="mx-auto max-w-3xl space-y-5">
    <div className="rounded-xl border p-4 text-center"><div className="text-3xl font-bold">{completed.length} / {total === null ? "…" : total}</div><div className="text-sm text-muted-foreground">Research completed / បានបញ្ចប់ការស្រាវជ្រាវ</div></div>
    <h1 className="text-2xl font-bold">BoBo Research / ការស្រាវជ្រាវ BoBo</h1>
    {syncError && <p role="alert" className="text-sm text-destructive">{syncError}</p>}
    <p className="text-sm text-muted-foreground">Open the TikTok profile, save the Markdown file in Obsidian, then click Saved & Next. No qualification or outreach changes are made.</p>
    <div className="grid grid-cols-3 gap-3 text-center">
      <div className="rounded-lg border p-4"><div className="text-2xl font-bold">{saved}</div><div>Saved MD / បានរក្សាទុក</div></div>
      <div className="rounded-lg border p-4"><div className="text-2xl font-bold">{pending.length}</div><div>Remaining / នៅសល់</div></div>
      <div className="rounded-lg border p-4"><div className="text-2xl font-bold">{skipped}</div><div>Skipped / រំលង</div></div>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} /> Include manually decided creators (view only)</label>
    {!loaded ? <p>Loading…</p> : current ? <section className="space-y-4 rounded-xl border bg-card p-6">
      <div className="text-xl font-semibold">{current.name}</div>
      <div className="break-all text-sm">{current.tiktok}</div>
      <a className="block rounded-lg bg-primary px-5 py-4 text-center text-lg font-bold text-primary-foreground" href={current.tiktok ?? "#"} target="_blank" rel="noopener noreferrer" onClick={() => void track(current.id, "opened")}>Open TikTok Profile / បើក TikTok ↗</a>
      <p className="text-sm">Save the profile as .md in Obsidian before clicking next. / រក្សាទុកជា .md ក្នុង Obsidian មុនចុចបន្ទាប់</p>
      <button className="w-full rounded-lg bg-emerald-700 px-5 py-4 text-lg font-bold text-white" onClick={()=>mark("saved")}>Saved MD → Next / រក្សាទុក → បន្ទាប់</button>
      <button className="w-full rounded-lg border px-5 py-3" onClick={()=>mark("skipped")}>Skip → Next / រំលង</button>
    </section> : <p className="rounded-lg border p-6">No more profiles in this queue.</p>}
    <section className="rounded-lg border p-3 space-y-2"><h2 className="font-semibold">Creator list / បញ្ជីអ្នកបង្កើត</h2><div className="max-h-80 overflow-y-auto space-y-1">{candidates.map(c => <a key={c.id} href={c.tiktok ?? "#"} target="_blank" rel="noopener noreferrer" onClick={() => void track(c.id, "opened")} className={`block rounded px-2 py-2 text-sm hover:bg-muted ${opened.includes(c.id) ? "line-through text-muted-foreground" : ""}`}>{c.name}</a>)}</div></section>
    <div className="flex flex-wrap gap-3">
      <button className="rounded-lg border px-4 py-3" onClick={undo}>Undo last / ត្រឡប់ក្រោយ</button>
      <button className="rounded-lg border px-4 py-3" onClick={exportProgress}>Export progress CSV / ទាញយក</button>
    </div>
    <p className="text-xs text-muted-foreground">Progress is stored in this browser only. Export the progress CSV regularly; this is not yet synchronized between devices or saved in the CRM. Only profiles already present in the live CRM appear here.</p>
  </div>;
}
