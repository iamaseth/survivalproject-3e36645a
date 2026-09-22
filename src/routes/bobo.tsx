import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { saveBoboTikTokProfile } from "@/lib/bobo-tiktok.functions";

export const Route = createFileRoute("/bobo")({ component: BoboTikTokResearch });
const TERMS = [
"prepper","prepping","emergency preparedness","emergency food","survival food","72 hour kit","72 hour bag","bug out bag","go bag","emergency kit",
"emergency supplies","emergency pantry","long term food storage","food storage","survival gear","disaster preparedness","disaster prep","power outage preparedness","hurricane preparedness","storm preparedness",
"earthquake preparedness","family emergency plan","family preparedness","emergency car kit","vehicle emergency kit","road trip emergency kit","camping gear","camping food","backpacking food","hiking essentials",
"outdoor survival","wilderness survival","bushcraft","off grid living","off grid cabin","homesteading","homestead pantry","self sufficiency","urban preparedness","apartment preparedness",
"minimalist emergency kit","emergency backpack","everyday carry emergency","winter storm preparedness","flood preparedness","wildfire preparedness","emergency nutrition","shelf stable food","emergency water storage","preparedness checklist"
];
const KEY = "survival-tabs-bobo-tiktok-v1";
type Progress = { done: number[]; index: number; saved: number };
function BoboTikTokResearch() {
  const saveFn = useServerFn(saveBoboTikTokProfile);
  const [progress, setProgress] = useState<Progress>({ done: [], index: 0, saved: 0 });
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "null");
      if (stored && Array.isArray(stored.done)) setProgress({
        done: stored.done.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < TERMS.length),
        index: Number.isInteger(stored.index) && stored.index >= 0 && stored.index < TERMS.length ? stored.index : 0,
        saved: Number.isInteger(stored.saved) && stored.saved >= 0 ? stored.saved : 0,
      });
    } catch { /* Start with first term if browser storage is unavailable. */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* Browser storage disabled. */ } }, [progress, ready]);
  const index = progress.index;
  const done = progress.done.includes(index);
  const allDone = progress.done.length === TERMS.length;
  const next = () => {
    const target = TERMS.findIndex((_, i) => !progress.done.includes(i));
    setProgress(p => ({ ...p, index: target < 0 ? p.index : target }));
    setMessage("");
  };
  const submit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await saveFn({ data: { url: url.trim(), keyword: TERMS[index] } });
      if (result.status === "saved") setProgress(p => ({ ...p, saved: p.saved + 1 }));
      setMessage(result.status === "saved" ? "Saved! Paste the next creator profile." : "Already in our CRM. Find the next creator.");
      setUrl("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save. Try again."); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-xl space-y-3 p-4 pb-12">
    <header className="flex items-center justify-between gap-2"><h1 className="text-xl font-semibold">BoBo · TikTok Research</h1><span className="text-sm text-muted-foreground">{progress.done.length}/{TERMS.length} ✓</span></header>
    <section className="rounded-lg border p-3 space-y-2">
      <div className="text-xs text-muted-foreground">SEARCH TERM {index + 1} OF {TERMS.length}</div>
      <div className="flex items-center justify-between gap-2"><strong className="text-lg">{TERMS[index]}</strong><button className="rounded-md border px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(TERMS[index])}>Copy term</button></div>
      <a className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground" href={`https://www.tiktok.com/search?q=${encodeURIComponent(TERMS[index])}`} target="_blank" rel="noopener noreferrer">Open TikTok search ↗</a>
      <p className="text-sm">Open each video → open the creator’s main profile → copy the profile link → paste it below. Continue through the search results.</p>
    </section>
    <section className="rounded-lg border p-3 space-y-2">
      <label htmlFor="profile" className="block text-sm font-medium">Paste creator profile link</label>
      <form onSubmit={e => { e.preventDefault(); void submit(); }} className="flex gap-2">
        <input id="profile" aria-label="TikTok creator profile link" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm" placeholder="tiktok.com/@creator" value={url} onChange={e => setUrl(e.target.value)} />
        <button type="submit" disabled={busy || !url.trim()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      </form>
      {message && <p role="status" className="text-sm">{message}</p>}
      <p className="text-xs text-muted-foreground">New profiles saved this browser: {progress.saved}. Profiles go to CRM for review, not outreach.</p>
    </section>
    <section className="rounded-lg border p-3 space-y-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={done} onChange={e => { setProgress(p => ({ ...p, done: e.target.checked ? [...new Set([...p.done, index])] : p.done.filter(n => n !== index) })); setMessage(""); }} /> I finished this search term</label>
      <button disabled={!done || allDone} className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50" onClick={next}>{allDone ? "All 50 terms complete ✓" : "Next unfinished term →"}</button>
      <button className="text-xs text-muted-foreground underline" onClick={() => setExpanded(v => !v)}>{expanded ? "Hide" : "Show"} all search terms ({progress.done.length} finished)</button>
      {expanded && <div className="grid grid-cols-2 gap-1">{TERMS.map((term, i) => <button key={term} onClick={() => { setProgress(p => ({ ...p, index: i })); setMessage(""); }} className={`rounded border px-2 py-1 text-left text-xs ${i === index ? "border-primary" : ""}`}>{progress.done.includes(i) ? "✓ " : "□ "}{i+1}. {term}</button>)}</div>}
    </section>
    <p className="text-xs text-muted-foreground">Progress checkmarks are saved in this browser. Use the same browser and device to continue tomorrow.</p>
  </main>;
}
