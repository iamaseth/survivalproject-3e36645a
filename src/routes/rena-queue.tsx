import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CREATORS, hydrateCreatorsFromDB, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { getMyOutreachSender, outreachPoolAction } from "@/lib/creators.functions";
import { TIKTOK_PROFILE_RE } from "@/lib/tiktok-dm-verification";

export const Route = createFileRoute("/rena-queue")({
  head: () => ({
    meta: [
      { title: "My TikTok DMs — Survival Tabs" },
      { name: "description", content: "Shared approved outreach pool: tap a creator to copy their DM and open TikTok." },
      { property: "og:title", content: "My TikTok DMs — Survival Tabs" },
      { property: "og:description", content: "Phone-first DM queue for Rena, Seth and BoBo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DmQueue,
});

const handleOf = (url: string) => url.match(/@([A-Za-z0-9._-]+)/)?.[1] ?? null;
const blocked = (c: CreatorRow) => /not relevant|dm blocked|do not contact/i.test(c.responseFollowup || "");

function inPool(c: CreatorRow) {
  return c.sethApprovalStatus === "approved" && Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok)) && Boolean(c.personalizedDm?.trim());
}
function statusOf(c: CreatorRow): "available" | "assigned" | "contacted" | "blocked" {
  if (c.outreachSentAt || c.contactedDate) return "contacted";
  if (blocked(c)) return "blocked";
  return c.outreachAssignee ? "assigned" : "available";
}

function DmQueue() {
  const version = useCreatorsVersion();
  const who = useServerFn(getMyOutreachSender);
  const act = useServerFn(outreachPoolAction);
  const [me, setMe] = useState<{ sender: string | null; approver: boolean } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "err"; text: string; dm?: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showPool, setShowPool] = useState(false);
  const [previewSender, setPreviewSender] = useState<string | null>(null);
  const viewingSender = previewSender ?? me?.sender ?? null;
  const readOnlyPreview = Boolean(previewSender && previewSender !== me?.sender);
  const lock = useRef(false);

  useEffect(() => { who().then(setMe).catch(() => setMe({ sender: null, approver: false })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useMemo(() => { void version; return CREATORS.filter(inPool).sort((a, b) => a.name.localeCompare(b.name)); }, [version]);
  const today = new Date().toISOString().slice(0, 10);
  const mine = pool.filter((c) => viewingSender && (
    (c.outreachAssignee === viewingSender && statusOf(c) === "assigned") ||
    (c.outreachSentBy === viewingSender && (c.outreachSentAt || "").slice(0, 10) === today)));
  const available = pool.filter((c) => statusOf(c) === "available");
  const done = mine.filter((c) => c.outreachSentAt).length;

  const refresh = async () => { await hydrateCreatorsFromDB(); };

  const run = async (c: CreatorRow, action: "claim" | "release" | "sent" | "undo_sent") => {
    await act({ data: { id: c.id, action } });
    await refresh();
  };

  const onTap = (c: CreatorRow) => {
    if (readOnlyPreview || lock.current || c.outreachSentAt) return;
    lock.current = true; setSavingId(c.id);
    const dm = c.personalizedDm!.trim();
    const copy = navigator.clipboard?.writeText(dm) ?? Promise.reject(new Error("no clipboard"));
    void (async () => {
      let copied = true;
      try { await copy; } catch { copied = false; }
      try {
        await run(c, "sent");
        setNotice(copied
          ? { kind: "ok", text: `DM for ${c.name} copied. Paste it in TikTok, send, then come back and tap the next row.` }
          : { kind: "warn", text: `Your phone blocked automatic copy for ${c.name}. Press and hold the message below, copy it, then paste in TikTok.`, dm });
      } catch (e) {
        setNotice({ kind: "err", text: `Not marked: ${e instanceof Error ? e.message : "error"}. Don't send this one — someone else may have it.`, dm: undefined });
        void refresh();
      } finally { lock.current = false; setSavingId(null); }
    })();
  };

  const simple = async (c: CreatorRow, action: "claim" | "release" | "undo_sent", ask?: string) => {
    if (readOnlyPreview || lock.current || (ask && !confirm(ask))) return;
    lock.current = true; setSavingId(c.id);
    try { await run(c, action); setNotice({ kind: "ok", text: action === "claim" ? `${c.name} is yours.` : action === "release" ? `${c.name} returned to the pool.` : `${c.name} undone.` }); }
    catch (e) { setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not save" }); void refresh(); }
    finally { lock.current = false; setSavingId(null); }
  };

  const tone = { ok: "border-emerald-600 bg-emerald-50 text-emerald-950", warn: "border-amber-500 bg-amber-50 text-amber-950", err: "border-red-600 bg-red-50 text-red-950" };

  if (me === null) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!me.sender && !me.approver) return (
    <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-sm">
      <h1 className="font-display text-2xl">TikTok DMs</h1>
      <p className="mt-2">Your account isn't set up as a DM sender (Seth, BoBo or Rena). Ask Seth to add you.</p>
      <p className="mt-2 text-muted-foreground">Shared pool: {available.length} available · {pool.filter((c) => statusOf(c) === "assigned").length} assigned · {pool.filter((c) => statusOf(c) === "contacted").length} contacted</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-16">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl text-foreground">{viewingSender ?? "Team"}'s TikTok DMs</h1>
          <p className="text-sm text-muted-foreground">{readOnlyPreview ? "Viewing another sender’s queue. Read-only preview; no messages or assignments will be changed." : "Tap a creator: DM copies + TikTok opens. Paste, send, come back, tap the next one."}</p>
          {me.approver ? <label className="mt-2 flex items-center gap-2 text-sm">View queue <select aria-label="View sender queue" className="rounded-md border border-input bg-background px-2 py-1" value={previewSender ?? me.sender ?? ""} onChange={e => setPreviewSender(e.target.value === me.sender ? null : e.target.value)}><option value={me.sender ?? ""}>My queue ({me.sender ?? "Team"})</option>{["Seth","Rena","BoBo"].filter(name => name !== me.sender).map(name => <option key={name} value={name}>{name}’s view (read-only)</option>)}</select></label> : null}
        </div>
        <button onClick={() => void refresh()} className="rounded-md border border-input px-2 py-1 text-xs">Refresh</button>
      </div>
      <div className="sticky top-0 z-10 rounded-xl border border-border bg-card p-3">
        <div className="flex justify-between text-sm font-semibold"><span>{done} done today</span><span>{mine.length - done} left</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${mine.length ? (done / mine.length) * 100 : 0}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Green = assumed sent (not confirmed). If TikTok blocks a message, stop and undo that row.</p>
      </div>
      {notice ? (
        <div role="status" className={`rounded-lg border-2 p-3 text-sm ${tone[notice.kind]}`}>
          <div className="font-medium">{notice.text}</div>
          {notice.dm ? <textarea readOnly value={notice.dm} rows={4} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded border border-input bg-background p-2 text-sm text-foreground" /> : null}
        </div>
      ) : null}
      {mine.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><div className="text-base font-semibold text-foreground">Nothing assigned to you</div>Claim creators from the shared pool below.</div> : null}
      <ul className="space-y-2">
        {mine.map((c) => {
          const sent = Boolean(c.outreachSentAt);
          const h = handleOf(c.tiktok!);
          return (
            <li key={c.id} className="flex items-stretch gap-2">
              <a href={sent ? undefined : c.tiktok!} target="_blank" rel="noopener noreferrer" aria-disabled={sent || savingId === c.id}
                onClick={(e) => { if (readOnlyPreview || sent || lock.current) { if (readOnlyPreview || sent) e.preventDefault(); return; } onTap(c); }}
                className={`flex min-h-[64px] flex-1 flex-col justify-center rounded-xl border-2 px-4 py-3 ${sent ? "border-emerald-600 bg-emerald-100 text-emerald-950" : "border-border bg-card text-foreground active:bg-secondary"}`}>
                <span className="text-base font-semibold">{sent ? "✓ " : ""}{c.name}</span>
                <span className="text-xs opacity-75">{h ? `@${h}` : "TikTok"}{savingId === c.id ? " · saving…" : sent ? " · assumed sent" : ""}</span>
              </a>
              {readOnlyPreview ? null : sent
                ? <button type="button" onClick={() => void simple(c, "undo_sent", `Undo ${c.name}? It goes back to not contacted.`)} className="rounded-xl border border-border px-3 text-xs text-muted-foreground">Undo</button>
                : <button type="button" onClick={() => void simple(c, "release", `Give ${c.name} back to the shared pool?`)} className="rounded-xl border border-border px-2 text-[11px] text-muted-foreground">Return</button>}
            </li>
          );
        })}
      </ul>
      <section className="rounded-xl border border-border bg-card">
        <button onClick={() => setShowPool((v) => !v)} className="flex w-full justify-between px-4 py-3 text-sm font-semibold">
          <span>Shared pool: {available.length} available</span><span>{showPool ? "Hide" : "Show"}</span>
        </button>
        {showPool ? (
          <ul className="divide-y divide-border border-t border-border text-sm">
            {pool.filter((c) => statusOf(c) !== "contacted" || (c.outreachSentAt || "").slice(0, 10) === today).slice(0, 100).map((c) => {
              const st = statusOf(c);
              return (
                <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">{st === "assigned" ? `assigned · ${c.outreachAssignee}` : st === "contacted" ? `contacted · ${c.outreachSentBy ?? "CRM"}` : st}</span>
                  {st === "available" && !readOnlyPreview ? <button disabled={savingId === c.id} onClick={() => void simple(c, "claim")} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Claim</button> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
