import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listBoboResearchQueue, listBatchOneResults } from "@/lib/influencer-master.functions";
import { getBoboProfileTracking, markBoboProfileTracking } from "@/lib/bobo-tiktok.functions";

export const Route = createFileRoute("/bobo-queue")({ component: BoboQueue });
type Candidate = {source_table:string;source_id:string;display_name:string;profile_url:string;stage:string};
const keyOf = (r: Candidate) => r.source_table + ":" + r.source_id;
function BoboQueue() {
  const load = useServerFn(listBoboResearchQueue);
  const loadBatch = useServerFn(listBatchOneResults);
  const loadProgress = useServerFn(getBoboProfileTracking);
  const save = useServerFn(markBoboProfileTracking);
  const [rows,setRows] = useState<Candidate[]>([]);
  const [opened,setOpened] = useState<string[]>([]);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [first, progress, batch] = await Promise.all([load({data:{page:0}}),loadProgress(),loadBatch()]);
        const all = [...first.rows];
        for (let page = 1; page * 100 < first.total; page++) {
          const next = await load({data:{page}});
          all.push(...next.rows);
        }
        const completed = new Set(batch.map(c => (c.tiktok || "").trim().toLowerCase().replace(/\/$/, "")));
        if (active) {setRows(all.filter(r => !completed.has((r.profile_url || "").trim().toLowerCase().replace(/\/$/, ""))));setOpened(progress.opened);setReady(true);}
      } catch(e) { if(active) setError("Unable to load queue: " + String(e)); }
    })();
    return () => {active=false;};
  }, []);
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter(r => {
      if (!r.profile_url) return false;
      const url = r.profile_url.trim().toLowerCase().replace(/\/$/, "");
      if(seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [rows]);
  const done = useMemo(() => new Set(opened), [opened]);
  const next = unique.find(r => !done.has(keyOf(r)));
  const count = unique.filter(r => done.has(keyOf(r))).length;
  const [busy,setBusy] = useState(false);
  const [blocked,setBlocked] = useState<Candidate[]>([]);
  async function persist(r: Candidate) {
    const id = keyOf(r);
    setOpened(old => old.includes(id) ? old : [...old,id]);
    try { await save({data:{id,action:"opened"}}); }
    catch(e) {setOpened(old=>old.filter(x=>x!==id));setError("Progress could not be saved: "+String(e));}
  }
  // window.open with "noopener" always returns null, so open without it and
  // sever the opener manually; a null return then reliably means "blocked".
  function tryOpen(url: string) {
    const w = window.open(url, "_blank");
    if (!w) return false;
    try { w.opener = null; } catch { /* cross-origin already */ }
    return true;
  }
  async function openBatch(list: Candidate[]) {
    if (busy || !list.length) return;
    setBusy(true); setError("");
    const ok: Candidate[] = [], failed: Candidate[] = [];
    for (const r of list) (tryOpen(r.profile_url) ? ok : failed).push(r);
    window.focus(); // best effort; browsers usually focus the newest tab anyway
    setBlocked(failed);
    if (failed.length) setError(`${failed.length} tab(s) were blocked by the browser and NOT marked opened. Allow pop-ups for this site, then press Retry.`);
    for (const r of ok) await persist(r);
    setBusy(false);
  }
  async function open(r: Candidate) {
    if (!tryOpen(r.profile_url)) { setError("Browser blocked the tab. Allow pop-ups and retry."); return; }
    if (!done.has(keyOf(r))) await persist(r);
  }
  const next15 = unique.filter(r => !done.has(keyOf(r))).slice(0, 15);
  return <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
    <Link to="/" className="text-sm underline">← Influencers</Link>
    <button type="button" disabled={!ready || !next || busy} onClick={()=>void openBatch(next15)}
      className="w-full rounded-xl bg-primary px-5 py-5 text-xl font-bold text-primary-foreground disabled:opacity-50">
      {!ready ? "Loading…" : busy ? "Opening…" : next ? `Open Next ${next15.length} ↗` : "All profiles opened ✓"}
    </button>
    <div className="text-center text-4xl font-bold tabular-nums">{ready ? count.toLocaleString() : "…"} / {ready ? unique.length.toLocaleString() : "…"}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {blocked.length > 0 && <button type="button" disabled={busy} onClick={()=>void openBatch(blocked.filter(r=>!done.has(keyOf(r))))} className="w-full rounded-lg border px-4 py-3 font-semibold">Retry {blocked.length} blocked</button>}
    <div className="divide-y rounded-lg border">
      {unique.map((r,i)=><button key={keyOf(r)} type="button" onClick={()=>void open(r)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted">
        <span className="w-7 shrink-0 text-sm text-muted-foreground">{i+1}</span>
        <span className={done.has(keyOf(r)) ? "line-through text-muted-foreground" : "font-medium"}>
          {done.has(keyOf(r)) ? "✕ " : ""}{r.display_name || r.profile_url}
        </span>
      </button>)}
    </div>
  </main>;
}
