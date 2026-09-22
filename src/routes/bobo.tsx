import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { saveBoboTikTokProfile } from "@/lib/bobo-tiktok.functions";

export const Route = createFileRoute("/bobo")({
  component: BoboTikTokResearch,
  head: () => ({
    meta: [
      { title: "BoBo TikTok Creator Research · Survival Tabs" },
      { name: "description", content: "Simple step-by-step tool for saving TikTok creator profile links into the Survival Tabs creator CRM." },
      { property: "og:title", content: "BoBo TikTok Creator Research" },
      { property: "og:description", content: "Search a keyword, paste creator profile links, save them to the CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const TERMS = [
"prepper","prepping","emergency preparedness","emergency food","survival food","72 hour kit","72 hour bag","bug out bag","go bag","emergency kit",
"emergency supplies","emergency pantry","long term food storage","food storage","survival gear","disaster preparedness","disaster prep","power outage preparedness","hurricane preparedness","storm preparedness",
"earthquake preparedness","family emergency plan","family preparedness","emergency car kit","vehicle emergency kit","road trip emergency kit","camping gear","camping food","backpacking food","hiking essentials",
"outdoor survival","wilderness survival","bushcraft","off grid living","off grid cabin","homesteading","homestead pantry","self sufficiency","urban preparedness","apartment preparedness",
"minimalist emergency kit","emergency backpack","everyday carry emergency","winter storm preparedness","flood preparedness","wildfire preparedness","emergency nutrition","shelf stable food","emergency water storage","preparedness checklist"
];
const KEY = "survival-tabs-bobo-tiktok-v2";
const OLD_KEY = "survival-tabs-bobo-tiktok-v1";

type Progress = {
  done: number[];
  index: number;
  saved: number;
  perTerm: Record<string, number>;
  recent: Record<string, string[]>;
};

const EMPTY: Progress = { done: [], index: 0, saved: 0, perTerm: {}, recent: {} };

function handleFromUrl(url: string) {
  const m = url.trim().match(/@([A-Za-z0-9._]{2,24})/);
  return m ? `@${m[1].toLowerCase()}` : url.trim();
}

function BoboTikTokResearch() {
  const saveFn = useServerFn(saveBoboTikTokProfile);
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "null");
      if (stored && Array.isArray(stored.done)) {
        setProgress({
          done: stored.done.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < TERMS.length),
          index: Number.isInteger(stored.index) && stored.index >= 0 && stored.index < TERMS.length ? stored.index : 0,
          saved: Number.isInteger(stored.saved) && stored.saved >= 0 ? stored.saved : 0,
          perTerm: stored.perTerm && typeof stored.perTerm === "object" ? stored.perTerm : {},
          recent: stored.recent && typeof stored.recent === "object" ? stored.recent : {},
        });
      }
    } catch { /* Start fresh if browser storage is unavailable. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* Browser storage disabled. */ }
  }, [progress, ready]);

  const index = progress.index;
  const term = TERMS[index];
  const done = progress.done.includes(index);
  const allDone = progress.done.length === TERMS.length;
  const termCount = progress.perTerm[term] ?? 0;
  const termRecent = progress.recent[term] ?? [];

  const goTo = (i: number) => {
    setProgress(p => ({ ...p, index: i }));
    setMessage(null);
    setUrl("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const nextTerm = () => {
    const target = TERMS.findIndex((_, i) => !progress.done.includes(i));
    if (target >= 0) goTo(target);
  };

  const submit = async () => {
    const value = url.trim();
    if (!value || busy) return;
    if (/\/video\/|\/photo\//i.test(value)) {
      setMessage({ tone: "error", text: "This is a video link. Tap the creator's name to open their profile page, then copy that link. (រូបភាព៖ ចុចឈ្មោះអ្នកបង្កើត ដើម្បីបើកទំព័រប្រវត្តិរូប)" });
      return;
    }
    setBusy(true); setMessage(null);
    try {
      const result = await saveFn({ data: { url: value, keyword: term } });
      if (result.status === "saved") {
        const handle = handleFromUrl(value);
        setProgress(p => ({
          ...p,
          saved: p.saved + 1,
          perTerm: { ...p.perTerm, [term]: (p.perTerm[term] ?? 0) + 1 },
          recent: { ...p.recent, [term]: [handle, ...(p.recent[term] ?? []).filter(h => h !== handle)].slice(0, 8) },
        }));
        setMessage({ tone: "ok", text: "Saved! Paste the next creator profile link. (រក្សាទុករួច)" });
      } else {
        setMessage({ tone: "warn", text: "Already in the CRM — not counted. Find another creator." });
      }
      setUrl("");
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save. Try again." });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const toneClass = message?.tone === "ok" ? "bg-primary/10 text-foreground"
    : message?.tone === "warn" ? "bg-muted text-foreground"
    : "bg-destructive/10 text-foreground";

  return <main className="mx-auto max-w-xl space-y-3 p-4 pb-16">
    <header className="flex items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">BoBo · TikTok Research</h1>
      <span className="text-sm text-muted-foreground">{progress.done.length}/{TERMS.length} ✓</span>
    </header>

    <section className="rounded-lg border p-3 space-y-2">
      <div className="text-xs text-muted-foreground">SEARCH WORD {index + 1} OF {TERMS.length}</div>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-lg">{term}</strong>
        <button className="rounded-md border px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(term)}>Copy word</button>
      </div>
      <a className="block rounded-md bg-primary px-3 py-3 text-center text-base font-semibold text-primary-foreground"
         href={`https://www.tiktok.com/search?q=${encodeURIComponent(term)}`} target="_blank" rel="noopener noreferrer">
        Open TikTok search ↗
      </a>
      <p className="text-sm">Watch many videos for this word. For each good creator: open their <strong>profile page</strong>, copy the link, paste it below, press Save. Repeat as many times as you like.</p>
      <p className="text-xs text-muted-foreground">ខ្មែរ៖ ចម្លងតំណទំព័រប្រវត្តិរូប (មិនមែនវីដេអូ) រួចចុច Save។</p>
    </section>

    <section className="rounded-lg border-2 border-primary/40 p-3 space-y-3">
      <label htmlFor="profile" className="block text-base font-semibold">Paste creator PROFILE link (not video link)</label>
      <form onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-2">
        <input
          id="profile"
          ref={inputRef}
          autoComplete="off"
          aria-label="TikTok creator profile link"
          className="w-full rounded-md border bg-background px-3 py-3 text-base"
          placeholder="https://www.tiktok.com/@creator"
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
        <button type="submit" disabled={busy || !url.trim()}
          className="w-full rounded-md bg-primary px-3 py-3 text-base font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      {message && <p role="status" className={`rounded-md px-3 py-2 text-sm ${toneClass}`}>{message.text}</p>}
      <div className="rounded-md bg-secondary px-3 py-2">
        <div className="text-base font-semibold">Profiles saved for this search: {termCount}</div>
        <div className="text-xs text-muted-foreground">Counted in this browser only — it is not the total number of creators in the CRM.</div>
      </div>
      {termRecent.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Recently saved here: {termRecent.join(", ")}
        </div>
      )}
    </section>

    <section className="rounded-lg border p-3 space-y-2">
      <div className="text-sm font-medium">Only when you have finished this search word:</div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={done} onChange={e => {
          setProgress(p => ({ ...p, done: e.target.checked ? [...new Set([...p.done, index])] : p.done.filter(n => n !== index) }));
        }} />
        Finish this search word
      </label>
      <button disabled={!done || allDone}
        className="w-full rounded-md border px-3 py-3 text-base font-semibold disabled:opacity-50"
        onClick={nextTerm}>
        {allDone ? "All 50 words complete ✓" : "Next keyword →"}
      </button>
      <button className="text-xs text-muted-foreground underline" onClick={() => setExpanded(v => !v)}>
        {expanded ? "Hide" : "Show"} all search words ({progress.done.length} finished)
      </button>
      {expanded && <div className="grid grid-cols-2 gap-1">{TERMS.map((t, i) =>
        <button key={t} onClick={() => goTo(i)} className={`rounded border px-2 py-1 text-left text-xs ${i === index ? "border-primary" : ""}`}>
          {progress.done.includes(i) ? "✓ " : "□ "}{i + 1}. {t}{(progress.perTerm[t] ?? 0) > 0 ? ` (${progress.perTerm[t]})` : ""}
        </button>)}</div>}
    </section>

    <p className="text-xs text-muted-foreground">Progress and counts are saved in this browser. Use the same browser and device to continue tomorrow. Saved profiles go to the CRM for review — no messages are sent.</p>
  </main>;
}
