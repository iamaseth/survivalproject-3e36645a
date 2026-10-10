import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getBoboProfileTracking, getBoboResearchQueue, markBoboProfileTracking } from "@/lib/bobo-tiktok.functions";

export const Route = createFileRoute("/bobo-research")({ component: BoboResearch });

function BoboResearch() {
  const loadQueue = useServerFn(getBoboResearchQueue);
  const [candidates, setCandidates] = useState<Array<{id:string;name:string;tiktok:string}>>([]);
  const load = useServerFn(getBoboProfileTracking);
  const mark = useServerFn(markBoboProfileTracking);
  const [opened, setOpened] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([load(), loadQueue()]).then(([r, queue]) => { if (active) { setOpened(r.opened); setCandidates(queue); setReady(true); } })
      .catch(e => { if (active) setError("Could not load saved progress: " + String(e)); });
    return () => { active = false; };
  }, []);
  async function openProfile(id: string) {
    if (opened.includes(id)) return;
    setOpened(old => [...old, id]);
    try { await mark({ data: { id, action: "opened" } }); }
    catch (e) {
      setOpened(old => old.filter(x => x !== id));
      setError("Could not save progress: " + String(e));
    }
  }
  const ids = new Set(candidates.map(c => c.id));
  const done = opened.filter(id => ids.has(id)).length;
  return <main className="mx-auto max-w-2xl space-y-3 p-4 pb-12">
    <header className="sticky top-0 z-10 rounded-lg border bg-background p-4 text-center">
      <div className="text-3xl font-bold">{ready ? done : "…"} / {candidates.length}</div>
      <div className="text-sm text-muted-foreground">Opened / បានបើក</div>
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="divide-y rounded-lg border">
      {candidates.map(c => <a key={c.id} href={c.tiktok!} target="_blank" rel="noopener noreferrer"
        onClick={() => void openProfile(c.id)}
        className={`block px-4 py-3 hover:bg-muted ${opened.includes(c.id) ? "line-through text-muted-foreground" : ""}`}>
        {c.name || c.tiktok}
      </a>)}
    </div>
  </main>;
}
