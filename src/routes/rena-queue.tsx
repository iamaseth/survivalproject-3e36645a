import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CREATORS, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { updateCreatorWorkflow } from "@/lib/creators.functions";

export const Route = createFileRoute("/rena-queue")({
  head: () => ({
    meta: [
      { title: "Rena TikTok DM Queue — Survival Tabs" },
      { name: "description", content: "Phone-first list: tap a creator to copy their DM and open TikTok." },
      { property: "og:title", content: "Rena TikTok DM Queue — Survival Tabs" },
      { property: "og:description", content: "Tap a creator to copy their personalized DM and open their TikTok profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RenaQueue,
});

// Marker that distinguishes "assumed sent" (tapped in this queue) from confirmed contact.
const ASSUMED_METHOD = "TikTok DM (assumed — Rena queue)";
const ASSUMED_FOLLOWUP = "Assumed sent — unconfirmed";
const LS_PREV = "rena-queue-prev-v1";

type Prev = { contacted_date: string | null; contact_method: string | null; response_followup: string | null };

const isAssumed = (c: CreatorRow) => c.contactMethod === ASSUMED_METHOD;
const handleOf = (url: string) => url.match(/@([A-Za-z0-9._-]+)/)?.[1] ?? null;

function eligible(c: CreatorRow) {
  if (!c.tiktok || !TIKTOK_PROFILE_RE.test(c.tiktok) || !c.personalizedDm?.trim()) return false;
  if (!isDmVerified(c)) return false; // individual human review required
  if (isAssumed(c)) return true; // keep showing green rows so they can be undone
  return baseCandidate(c);
}

function RenaQueue() {
  const version = useCreatorsVersion();
  const updateFn = useServerFn(updateCreatorWorkflow);
  const [, force] = useState(0);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "err"; text: string; dm?: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const lock = useRef(false);
  const [prev, setPrev] = useState<Record<string, Prev>>({});

  useEffect(() => {
    try { setPrev(JSON.parse(localStorage.getItem(LS_PREV) || "{}")); } catch { /* ignore */ }
  }, []);

  const rows = useMemo(() => {
    void version;
    return CREATORS.filter(eligible).sort((a, b) => a.name.localeCompare(b.name));
  }, [version]);
  const done = rows.filter(isAssumed).length;

  const savePrev = (next: Record<string, Prev>) => { setPrev(next); localStorage.setItem(LS_PREV, JSON.stringify(next)); };

  const onTap = (c: CreatorRow) => {
    if (lock.current || isAssumed(c)) return;
    lock.current = true;
    setSavingId(c.id);
    const dm = c.personalizedDm!.trim();
    // Clipboard call starts inside the tap gesture; the native link opens TikTok in the same gesture.
    const copy = navigator.clipboard?.writeText(dm) ?? Promise.reject(new Error("no clipboard"));
    const before: Prev = { contacted_date: c.contactedDate, contact_method: c.contactMethod, response_followup: c.responseFollowup };
    const today = new Date().toISOString().slice(0, 10);
    void (async () => {
      let copied = true;
      try { await copy; } catch { copied = false; }
      try {
        await updateFn({ data: { id: c.id, contacted_date: today, contact_method: ASSUMED_METHOD, response_followup: ASSUMED_FOLLOWUP } });
        c.contactedDate = today; c.contactMethod = ASSUMED_METHOD; c.responseFollowup = ASSUMED_FOLLOWUP;
        savePrev({ ...prev, [c.id]: before });
        setNotice(copied
          ? { kind: "ok", text: `DM for ${c.name} copied. Paste it in TikTok, send, then come back and tap the next row.` }
          : { kind: "warn", text: `Your phone blocked automatic copy for ${c.name}. Press and hold the message below, copy it, then paste in TikTok.`, dm });
      } catch (e) {
        setNotice({ kind: "err", text: `Could not save ${c.name}: ${e instanceof Error ? e.message : "error"}. Row not marked.`, dm: copied ? undefined : dm });
      } finally {
        lock.current = false; setSavingId(null); force((n) => n + 1);
      }
    })();
  };

  const undo = async (c: CreatorRow) => {
    if (lock.current || !isAssumed(c)) return;
    if (!confirm(`Undo ${c.name}? It goes back to not contacted.`)) return;
    lock.current = true; setSavingId(c.id);
    const p = prev[c.id] ?? { contacted_date: null, contact_method: null, response_followup: null };
    try {
      await updateFn({ data: { id: c.id, ...p } });
      c.contactedDate = p.contacted_date; c.contactMethod = p.contact_method; c.responseFollowup = p.response_followup;
      const next = { ...prev }; delete next[c.id]; savePrev(next);
      setNotice({ kind: "ok", text: `${c.name} undone.` });
    } catch (e) {
      setNotice({ kind: "err", text: `Undo failed: ${e instanceof Error ? e.message : "error"}` });
    } finally { lock.current = false; setSavingId(null); force((n) => n + 1); }
  };

  const tone = { ok: "border-emerald-600 bg-emerald-50 text-emerald-950", warn: "border-amber-500 bg-amber-50 text-amber-950", err: "border-red-600 bg-red-50 text-red-950" };

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-16">
      <div>
        <h1 className="font-display text-2xl text-foreground">Rena TikTok DMs</h1>
        <p className="text-sm text-muted-foreground">Tap a creator: DM copies + TikTok opens. Paste, send, come back, tap the next one.</p>
      </div>
      <div className="sticky top-0 z-10 rounded-xl border border-border bg-card p-3">
        <div className="flex justify-between text-sm font-semibold"><span>{done} done</span><span>{rows.length - done} left</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Green = assumed sent (not confirmed). If TikTok blocks a message, stop and undo that row.</p>
      </div>
      {notice ? (
        <div role="status" className={`rounded-lg border-2 p-3 text-sm ${tone[notice.kind]}`}>
          <div className="font-medium">{notice.text}</div>
          {notice.dm ? <textarea readOnly value={notice.dm} rows={4} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded border border-input bg-background p-2 text-sm text-foreground" /> : null}
        </div>
      ) : null}
      {rows.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No qualified TikTok creators with a saved DM are waiting.</div> : null}
      <ul className="space-y-2">
        {rows.map((c) => {
          const sent = isAssumed(c);
          const h = handleOf(c.tiktok!);
          return (
            <li key={c.id} className="flex items-stretch gap-2">
              <a
                href={sent ? undefined : c.tiktok!}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={sent || savingId === c.id}
                onClick={(e) => { if (sent || lock.current) { e.preventDefault(); return; } onTap(c); }}
                className={`flex min-h-[64px] flex-1 flex-col justify-center rounded-xl border-2 px-4 py-3 ${sent ? "border-emerald-600 bg-emerald-100 text-emerald-950" : "border-border bg-card text-foreground active:bg-secondary"}`}
              >
                <span className="text-base font-semibold">{sent ? "✓ " : ""}{c.name}</span>
                <span className="text-xs opacity-75">{h ? `@${h}` : "TikTok"}{savingId === c.id ? " · saving…" : sent ? " · assumed sent" : ""}</span>
              </a>
              {sent ? (
                <button type="button" onClick={() => void undo(c)} className="rounded-xl border border-border px-3 text-xs text-muted-foreground">Undo</button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
