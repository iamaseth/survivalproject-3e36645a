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
  async function open(r: Candidate) {
    // Open the profile immediately in the user click, before awaiting persistence.
    window.open(r.profile_url, "_blank", "noopener,noreferrer");
    const id = keyOf(r);
    if (done.has(id)) return;
    setOpened(old => [...old,id]);
    try { await save({data:{id,action:"opened"}}); }
    catch(e) {setOpened(old=>old.filter(x=>x!==id));setError("Progress could not be saved: "+String(e));}
  }
  return <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
    <Link to="/" className="text-sm underline">← Influencers</Link>
    <button type="button" disabled={!ready || !next} onClick={()=>{if(next) void open(next);}}
      className="w-full rounded-xl bg-primary px-5 py-5 text-xl font-bold text-primary-foreground disabled:opacity-50">
      {!ready ? "Loading…" : next ? "Open Next Influencer ↗" : "All profiles opened ✓"}
    </button>
    <div className="text-center text-4xl font-bold tabular-nums">{ready ? count.toLocaleString() : "…"} / {ready ? unique.length.toLocaleString() : "…"}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
