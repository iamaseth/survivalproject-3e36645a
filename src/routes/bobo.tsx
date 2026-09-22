import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { saveBoboTikTokProfile, getBoboResearchProgress, putBoboResearchProgress } from "@/lib/bobo-tiktok.functions";

export const Route = createFileRoute("/bobo")({
  component: BoboTikTokResearch,
  head: () => ({
    meta: [
      { title: "BoBo TikTok Creator Research · Survival Tabs" },
      { name: "description", content: "Simple step-by-step tool for saving TikTok creator profile links into the Survival Tabs creator CRM." },
      { property: "og:title", content: "BoBo TikTok Creator Research" },
      { property: "og:description", content: "Search a keyword, paste many creator profile links, save them all to the CRM." },
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


const looksLikeUrl = (line: string) => /tiktok\.com\//i.test(line);

type BatchResult = {
  saved: number;
  duplicates: number;
  invalid: number;
  failed: number;
  savedLines: string[];
  savedHandles: string[];
};

function BoboTikTokResearch() {
  const saveFn = useServerFn(saveBoboTikTokProfile);
  const loadProgress = useServerFn(getBoboResearchProgress);
  const storeProgress = useServerFn(putBoboResearchProgress);
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const remote = await loadProgress();
        if (!active) return;
        if (remote.exists) setProgress(remote.progress);
        else {
          const stored = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "null");
          if (stored && Array.isArray(stored.done)) {
            const initial: Progress = {
              done: stored.done, index: stored.index ?? 0, saved: stored.saved ?? 0,
              perTerm: stored.perTerm ?? {}, recent: stored.recent ?? {},
            };
            await storeProgress({ data: initial });
            if (active) setProgress(initial);
          }
        }
        if (active) setReady(true);
      } catch (error) {
        if (active) setMessage({ tone: "error", text: "Could not load database progress. Please sign in and refresh before saving. " + String(error) });
      }
    })();
    return () => { active = false; };
  }, []);

  const persist = async (next: Progress) => {
    await storeProgress({ data: next });
    setProgress(next);
  };

  const index = progress.index;
  const term = TERMS[index];
  const done = progress.done.includes(index);
  const allDone = progress.done.length === TERMS.length;
  const termCount = progress.perTerm[term] ?? 0;
  const termRecent = progress.recent[term] ?? [];
  const lineCount = batch.split("\n").map(l => l.trim()).filter(Boolean).length;

  const goTo = (i: number) => {
    void persist({ ...progress, index: i }).catch(e => setMessage({ tone: "error", text: String(e) }));
    setMessage(null);
    setBatch("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const nextTerm = () => {
    const target = TERMS.findIndex((_, i) => !progress.done.includes(i));
    if (target >= 0) goTo(target);
  };

  const submitBatch = async () => {
    if (busy) return;
    const lines = batch.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    setBusy(true); setMessage(null);
    const result: BatchResult = { saved: 0, duplicates: 0, invalid: 0, failed: 0, savedLines: [], savedHandles: [] };
    const keepLines: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) { result.duplicates += 1; continue; }
      seen.add(normalized);
      if (!looksLikeUrl(line)) { result.invalid += 1; keepLines.push(line); continue; }
      try {
        const res = await saveFn({ data: { url: line, keyword: term } });
        if (res.status === "saved") {
          result.saved += 1;
          result.savedLines.push(line);
          result.savedHandles.push(handleFromUrl(line));
        } else {
          result.duplicates += 1;
        }
      } catch {
        result.failed += 1;
        keepLines.push(line);
      }
    }

    if (result.saved > 0) {
      try { await persist({ ...progress, saved: progress.saved + result.saved,
        perTerm: { ...progress.perTerm, [term]: (progress.perTerm[term] ?? 0) + result.saved },
        recent: { ...progress.recent, [term]: [...result.savedHandles, ...termRecent.filter(h => !result.savedHandles.includes(h))].slice(0, 8) },
      }); } catch (e) { setMessage({ tone: "error", text: "Profiles saved, but progress sync failed. Refresh before continuing. " + String(e) }); setBusy(false); return; }
    }

    // Keep only lines that were NOT saved, so BoBo can fix or retry them.
    setBatch(keepLines.join("\n"));

    const parts: string[] = [];
    if (result.saved > 0) parts.push(`${result.saved} saved ✓`);
    if (result.duplicates > 0) parts.push(`${result.duplicates} already in CRM (not counted)`);
    if (result.invalid > 0) parts.push(`${result.invalid} not a TikTok link (kept below to fix)`);
    if (result.failed > 0) parts.push(`${result.failed} failed (kept below — press Save again to retry)`);
    setMessage({
      tone: result.failed > 0 || result.invalid > 0 ? "warn" : result.saved > 0 ? "ok" : "warn",
      text: parts.length > 0 ? parts.join(" · ") : "Nothing to save.",
    });
    setBusy(false);
    textareaRef.current?.focus();
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
      <p className="text-sm">Open a video, click Copy link, paste it below, and press Save. Repeat for each creator. Profile links also work.</p>
      <p className="text-xs text-muted-foreground">ខ្មែរ៖ ចម្លងតំណវីដេអូ បិទភ្ជាប់ រួចចុច Save។ ធ្វើម្តងមួយ។</p>
    </section>

    <section className="rounded-lg border-2 border-primary/40 p-3 space-y-3">
      <label htmlFor="profiles" className="block text-base font-semibold">
        Paste one TikTok video or creator profile link
      </label>
      <textarea
        id="profiles"
        ref={textareaRef}
        autoComplete="off"
        rows={2}
        aria-label="TikTok video or creator profile link"
        className="w-full rounded-md border bg-background px-3 py-3 text-base font-mono leading-relaxed"
        placeholder={"https://www.tiktok.com/@creator/video/123456789"}
        value={batch}
        onChange={e => setBatch(e.target.value)}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{lineCount} link{lineCount === 1 ? "" : "s"} in the box</span>
        <span>Links stay here until you press Save</span>
      </div>
      <button type="button" disabled={!ready || busy || lineCount === 0}
        className="w-full rounded-md bg-primary px-3 py-4 text-lg font-semibold text-primary-foreground disabled:opacity-50"
        onClick={() => void submitBatch()}>
        {busy ? "Saving… please wait" : `Save creator & add next${lineCount > 0 ? ` (${lineCount})` : ""}`}
      </button>
      {message && <p role="status" className={`rounded-md px-3 py-2 text-sm ${toneClass}`}>{message.text}</p>}
      <div className="rounded-md bg-secondary px-3 py-2">
        <div className="text-base font-semibold">Creators saved for this search: {termCount} · Next: #{termCount + 1}</div>
        <div className="text-xs text-muted-foreground">Progress is saved to your signed-in database account. TikTok search results may change order.</div>
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
        <input type="checkbox" checked={done} onChange={e => { void persist({ ...progress, done: e.target.checked ? [...new Set([...progress.done, index])] : progress.done.filter(n => n !== index) }).catch(err => setMessage({ tone: "error", text: String(err) })); }} />
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

    <p className="text-xs text-muted-foreground">Progress is saved in the database for this signed-in account. Saved creator profiles go to the CRM; no messages are sent.</p>
  </main>;
}
