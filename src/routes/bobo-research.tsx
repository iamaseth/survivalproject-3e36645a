import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CREATORS, useCreatorsVersion } from "@/lib/creator-partnerships";

export const Route = createFileRoute("/bobo-research")({ component: BoboResearch });
type Progress = Record<string, "saved" | "skipped">;
const KEY = "survival-tabs-bobo-research-progress-v1";
function BoboResearch() {
  useCreatorsVersion();
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
    <h1 className="text-2xl font-bold">BoBo Research / ការស្រាវជ្រាវ BoBo</h1>
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
      <a className="block rounded-lg bg-primary px-5 py-4 text-center text-lg font-bold text-primary-foreground" href={current.tiktok ?? "#"} target="_blank" rel="noopener noreferrer">Open TikTok Profile / បើក TikTok ↗</a>
      <p className="text-sm">Save the profile as .md in Obsidian before clicking next. / រក្សាទុកជា .md ក្នុង Obsidian មុនចុចបន្ទាប់</p>
      <button className="w-full rounded-lg bg-emerald-700 px-5 py-4 text-lg font-bold text-white" onClick={()=>mark("saved")}>Saved MD → Next / រក្សាទុក → បន្ទាប់</button>
      <button className="w-full rounded-lg border px-5 py-3" onClick={()=>mark("skipped")}>Skip → Next / រំលង</button>
    </section> : <p className="rounded-lg border p-6">No more profiles in this queue.</p>}
    <div className="flex flex-wrap gap-3">
      <button className="rounded-lg border px-4 py-3" onClick={undo}>Undo last / ត្រឡប់ក្រោយ</button>
      <button className="rounded-lg border px-4 py-3" onClick={exportProgress}>Export progress CSV / ទាញយក</button>
    </div>
    <p className="text-xs text-muted-foreground">Progress is stored in this browser only. Export the progress CSV regularly; this is not yet synchronized between devices or saved in the CRM. Only profiles already present in the live CRM appear here.</p>
  </div>;
}
