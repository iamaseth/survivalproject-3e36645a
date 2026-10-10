import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CREATORS, useCreatorsVersion } from "@/lib/creator-partnerships";
import { getBoboProfileTracking, markBoboProfileTracking } from "@/lib/bobo-tiktok.functions";

export const Route = createFileRoute("/bobo-research")({ component: BoboResearch });

function BoboResearch() {
  useCreatorsVersion();
  const load = useServerFn(getBoboProfileTracking);
  const mark = useServerFn(markBoboProfileTracking);
  const [opened, setOpened] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    return CREATORS.filter(c => {
      if (!c.tiktok || c.sethApprovalStatus === "rejected" || c.sethApprovalStatus === "approved") return false;
      const key = c.tiktok.toLowerCase().replace(/\/$/, "").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => (a.tiktok ?? "").localeCompare(b.tiktok ?? ""));
  }, [CREATORS]);
  useEffect(() => {
    let active = true;
    void load().then(r => { if (active) { setOpened(r.opened); setReady(true); } })
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
