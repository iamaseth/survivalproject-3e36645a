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

const isVideoLink = (line: string) => /\/video\/|\/photo\//i.test(line);
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
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const lineCount = batch.split("\n").map(l => l.trim()).filter(Boolean).length;

  const goTo = (i: number) => {
    setProgress(p => ({ ...p, index: i }));
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

    // Anything that is clearly a video link is rejected up front, before saving.
    const videoLines = lines.filter(isVideoLink);
    if (videoLines.length > 0) {
      setMessage({
        tone: "error",
        text: `${videoLines.length} line${videoLines.length === 1 ? " is" : "s are"} video links — profile links only. Tap the creator's name to open their profile page, then copy that link. (ចុចឈ្មោះអ្នកបង្កើត ដើម្បីបើកទំព័រប្រវត្តិរូប)`,
      });
      setBatch(lines.filter(l => !isVideoLink(l)).join("\n"));
      textareaRef.current?.focus();
      return;
    }

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
      setProgress(p => ({
        ...p,
        saved: p.saved + result.saved,
        perTerm: { ...p.perTerm, [term]: (p.perTerm[term] ?? 0) + result.saved },
        recent: {
          ...p.recent,
          [term]: [...result.savedHandles, ...(p.recent[term] ?? []).filter(h => !result.savedHandles.includes(h))].slice(0, 8),
        },
      }));
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
      <p className="text-sm">Watch videos for this word. When you find a good creator: open their <strong>profile page</strong>, copy the link, and paste it in the box below. You can paste <strong>many links — one per line</strong> — then save them all at once.</p>
      <p className="text-xs text-muted-foreground">ខ្មែរ៖ ចម្លងតំណទំព័រប្រវត្តិរូប (មិនមែនវីដេអូ) ដាក់មួយបន្ទាត់មួយតំណ រួចចុច Save ទាំងអស់។</p>
    </section>

    <section className="rounded-lg border-2 border-primary/40 p-3 space-y-3">
      <label htmlFor="profiles" className="block text-base font-semibold">
        Paste MANY TikTok creator PROFILE links here — ONE LINK PER LINE
      </label>
      <textarea
        id="profiles"
        ref={textareaRef}
        autoComplete="off"
        rows={9}
        aria-label="TikTok creator profile links, one per line"
        className="w-full rounded-md border bg-background px-3 py-3 text-base font-mono leading-relaxed"
        placeholder={"https://www.tiktok.com/@creator1\nhttps://www.tiktok.com/@creator2\nhttps://www.tiktok.com/@creator3"}
        value={batch}
        onChange={e => setBatch(e.target.value)}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{lineCount} link{lineCount === 1 ? "" : "s"} in the box</span>
        <span>Links stay here until you press Save</span>
      </div>
      <button type="button" disabled={busy || lineCount === 0}
        className="w-full rounded-md bg-primary px-3 py-4 text-lg font-semibold text-primary-foreground disabled:opacity-50"
        onClick={() => void submitBatch()}>
        {busy ? "Saving… please wait" : `Save ALL profiles for this search${lineCount > 0 ? ` (${lineCount})` : ""}`}
      </button>
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
