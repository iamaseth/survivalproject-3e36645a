import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CREATORS, hydrateCreatorsFromDB, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { getMyOutreachSender, outreachPoolAction, manualQualificationOverride } from "@/lib/creators.functions";
import { TIKTOK_PROFILE_RE } from "@/lib/tiktok-dm-verification";

export const Route = createFileRoute("/rena-queue")({
  head: () => ({
    links: [{ rel: "manifest", href: "/rena.webmanifest" }, { rel: "icon", type: "image/svg+xml", href: "/rena-icon.svg" }, { rel: "apple-touch-icon", href: "/rena-icon.svg" }],
    meta: [
      { title: "Rena Outreach — Survival Tabs" },
      { name: "theme-color", content: "#173c2c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Rena Outreach" },
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
  return c.sethApprovalStatus === "approved" && !blocked(c) && Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok)) && Boolean(c.personalizedDm?.trim());
}
function statusOf(c: CreatorRow): "available" | "assigned" | "contacted" | "blocked" {
  if (c.outreachSentAt || c.contactedDate) return "contacted";
  if (blocked(c)) return "blocked";
  return c.outreachAssignee ? "assigned" : "available";
}

export function DmQueue({ sender = "Rena" }: { sender?: "Rena" | "Seth" }) {
  const version = useCreatorsVersion();
  const who = useServerFn(getMyOutreachSender);
  const act = useServerFn(outreachPoolAction);
  const manualReject = useServerFn(manualQualificationOverride);
  const [me, setMe] = useState<{ sender: string | null; approver: boolean } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "err"; text: string; dm?: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [previewSender, setPreviewSender] = useState<string | null>(sender);
  const viewingSender = previewSender ?? me?.sender ?? null;
  const readOnlyPreview = Boolean(viewingSender && viewingSender !== me?.sender && !(sender === "Seth" && me?.approver));
  const lock = useRef(false);
  const touchStart = useRef<{id:string;x:number;y:number}|null>(null);
  const [swipingId,setSwipingId] = useState<string|null>(null);
  const [actionsId,setActionsId] = useState<string|null>(null);
  const [laterIds,setLaterIds] = useState<string[]>([]);
  const [sessionSentIds,setSessionSentIds] = useState<string[]>([]);

  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/rena-sw.js").catch(() => {}); }, []);
  useEffect(() => { who().then(setMe).catch(() => setMe({ sender: null, approver: false })); void hydrateCreatorsFromDB().catch(e => setLoadError(e instanceof Error ? e.message : "Could not load outreach queue")); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useMemo(() => { void version; return CREATORS.filter(inPool).sort((a, b) => a.name.localeCompare(b.name)); }, [version]);
  const mine = pool.filter((c) => viewingSender && (
    (c.outreachAssignee === viewingSender && statusOf(c) === "assigned") ||
    (c.outreachSentBy === viewingSender && Boolean(c.outreachSentAt) && sessionSentIds.includes(c.id)))).sort((a,b)=>Number(laterIds.includes(a.id))-Number(laterIds.includes(b.id)));
  const pending = mine.filter(c=>!c.outreachSentAt);
  const completedThisSession = mine.filter(c=>Boolean(c.outreachSentAt));
  const available = pool.filter((c) => statusOf(c) === "available");
  const done = completedThisSession.length;

  const refresh = async () => { try { setLoadError(null); await hydrateCreatorsFromDB(); } catch(e) { setLoadError(e instanceof Error ? e.message : "Could not refresh outreach queue"); } };

  const run = async (c: CreatorRow, action: "claim" | "release" | "sent" | "undo_sent") => {
    await act({ data: { id: c.id, action } });
    await refresh();
  };

  const onTap = (c: CreatorRow) => {
    if (lock.current || c.outreachSentAt) return;
    lock.current = true; setSavingId(c.id);
    const dm = c.personalizedDm!.trim();
    const copy = navigator.clipboard?.writeText(dm) ?? Promise.reject(new Error("no clipboard"));
    void (async () => {
      let copied = true;
      try { await copy; } catch { copied = false; }
      try {
        if (readOnlyPreview) { setNotice({ kind: copied ? "ok" : "warn", text: copied ? "DM copied for preview. Open TikTok; nothing was marked sent." : "Copy this DM manually. Preview did not change CRM status.", dm: copied ? undefined : dm }); return; }
        setNotice(copied
          ? { kind: "ok", text: `DM copied for ${c.name}. Send it in TikTok, then tap Sent.` }
          : { kind: "warn", text: `Automatic copy was blocked for ${c.name}. Copy the message below manually.`, dm });
      } catch (e) {
        setNotice({ kind: "err", text: `Not marked: ${e instanceof Error ? e.message : "error"}. Don't send this one — someone else may have it.`, dm: undefined });
        void refresh();
      } finally { lock.current = false; setSavingId(null); }
    })();
  };

  const simple = async (c: CreatorRow, action: "claim" | "release" | "undo_sent" | "sent", ask?: string) => {
    if (readOnlyPreview || lock.current || (ask && !confirm(ask))) return;
    lock.current = true; setSavingId(c.id);
    try { await run(c, action); if(action==="sent") setSessionSentIds(ids=>ids.includes(c.id)?ids:[...ids,c.id]); if(action==="undo_sent") setSessionSentIds(ids=>ids.filter(id=>id!==c.id)); setActionsId(null); setNotice({ kind: "ok", text: action === "claim" ? `${c.name} is yours.` : action === "release" ? `${c.name} returned to the pool.` : action === "sent" ? `${c.name} marked sent.` : `${c.name} undone.` }); }
    catch (e) { setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not save" }); void refresh(); }
    finally { lock.current = false; setSavingId(null); }
  };

  const reject = async (c: CreatorRow) => {
    if (readOnlyPreview || lock.current || c.outreachSentAt) return;
    if (!confirm(`Reject ${c.name} as Not Relevant? This manual decision overrides AI qualification and removes them from Rena's queue.`)) return;
    if (!confirm(`Confirm you reviewed the correct TikTok profile for ${c.name}.`)) return;
    lock.current = true;
    setSavingId(c.id);
    try {
      const result = await manualReject({ data: {
        id: c.id, decision: "rejected", checkedProfile: true,
        evidence: "Manual Not Relevant rejection from Rena outreach queue",
        assignee: "Rena",
      } });
      if (!result?.ok) throw new Error("Manual rejection was not confirmed.");
      await refresh();
      setActionsId(null);
      setNotice({ kind: "ok", text: `${c.name} manually rejected as Not Relevant. CRM record retained.` });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not reject creator" });
      void refresh();
    } finally {
      lock.current = false;
      setSavingId(null);
    }
  };

  const swipeUndo = (c: CreatorRow, x: number, y: number) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || start.id !== c.id) return;
    if (start.x - x > 70 && Math.abs(start.y - y) < 55) {
      setSwipingId(c.id);
      if (!readOnlyPreview && !c.outreachSentAt) void reject(c);
    }
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
          <h1 className="font-display text-2xl text-foreground">{viewingSender === "Rena" ? "Rena’s Outreach Queue" : viewingSender === "Seth" ? "Seth’s Outreach Queue" : `${viewingSender ?? "Team"}’s TikTok DMs`}</h1>
          <p className="text-sm text-muted-foreground">Tap a creator to copy the DM and open TikTok. Tap Sent after sending.</p>
          {readOnlyPreview ? <p className="text-xs text-muted-foreground">Preview: tap to copy and open TikTok. Only the assigned sender can mark messages done.</p> : null}
        </div>
        <button onClick={() => void refresh()} className="rounded-md border border-input px-3 py-2 text-sm">Refresh</button>
      </div>
      <div className="sticky top-0 z-10 rounded-xl border border-border bg-card p-3">
        <div className="flex justify-between text-sm font-semibold"><span>{done} done today</span><span>{pending.length} left</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${mine.length ? (done / mine.length) * 100 : 0}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Sent creators move to the completed section below and disappear when this page is reopened. Not Relevant creators are removed from the queue.</p>
      </div>
      {loadError ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{loadError}</p> : null}
      {notice ? (
        <div role="status" className={`rounded-lg border-2 p-3 text-sm ${tone[notice.kind]}`}>
          <div className="font-medium">{notice.text}</div>
          {notice.dm ? <textarea readOnly value={notice.dm} rows={4} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded border border-input bg-background p-2 text-sm text-foreground" /> : null}
        </div>
      ) : null}
      {pending.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><div className="text-base font-semibold text-foreground">No pending creators</div>New assignments will appear here.</div> : null}
      <ul className="space-y-2">
        {pending.map((c) => {
          const sent = Boolean(c.outreachSentAt);
          return (
            <li key={c.id} className="flex flex-wrap items-stretch gap-2" onTouchStart={e=>{const t=e.touches[0];touchStart.current={id:c.id,x:t.clientX,y:t.clientY};}} onTouchEnd={e=>{const t=e.changedTouches[0];swipeUndo(c,t.clientX,t.clientY);}}>
              <a href={sent ? undefined : c.tiktok!} target="_blank" rel="noopener noreferrer" aria-disabled={sent || savingId === c.id}
                onClick={(e) => { if (sent || lock.current || swipingId===c.id) { e.preventDefault(); setSwipingId(null); return; } onTap(c); }}
                className={`flex min-h-[76px] flex-1 flex-col justify-center rounded-xl border-2 px-4 py-3 ${sent ? "border-emerald-600 bg-emerald-100 text-emerald-950" : "border-border bg-card text-foreground active:bg-secondary"}`}>
                <span className="text-base font-semibold">{sent ? "✓ " : ""}{c.name}</span>
                <span className="text-xs opacity-75">{c.followersSignal?.trim() ? `${c.followersSignal.trim()} followers` : "Followers not recorded"}{savingId === c.id ? " · saving…" : sent ? " · done" : ""}</span>
              </a>
              {!sent && !readOnlyPreview && <button type="button" disabled={savingId===c.id} onClick={()=>void simple(c,"sent")} className="rounded-xl bg-emerald-700 px-3 text-sm font-semibold text-white">Sent</button>}
              <button type="button" onClick={()=>setActionsId(v=>v===c.id?null:c.id)} className="rounded-xl border border-border px-3 text-sm" aria-label={`Actions for ${c.name}`}>•••</button>
              {actionsId===c.id && <div className="basis-full grid w-full grid-cols-4 gap-1 rounded-xl border p-2 text-xs font-medium">
                <button type="button" disabled={readOnlyPreview || !sent} onClick={()=>{setActionsId(null);void simple(c,"undo_sent");}} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-blue-100 text-blue-900 disabled:opacity-40"><span className="text-xl">↶</span>Undo</button>
                <button type="button" disabled={readOnlyPreview || sent} onClick={()=>void reject(c)} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-red-100 text-red-900 disabled:opacity-40"><span className="text-xl">✕</span>Reject</button>
                <button type="button" onClick={()=>{setLaterIds(ids=>ids.includes(c.id)?ids:[...ids,c.id]);setActionsId(null);}} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-amber-100 text-amber-900"><span className="text-xl">◷</span>Later</button>
                <button type="button" disabled={readOnlyPreview || sent} onClick={()=>{setActionsId(null);void simple(c,"sent");}} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-green-100 text-green-900 disabled:opacity-40"><span className="text-xl">✓</span>Sent</button>
              </div>}
            </li>
          );
        })}
      </ul>
      {completedThisSession.length > 0 && <section className="mt-5 space-y-2"><h2 className="text-sm font-semibold text-muted-foreground">Sent this session ({completedThisSession.length})</h2><ul className="space-y-2">{completedThisSession.map(c=><li key={c.id} className="flex items-center justify-between rounded-xl border-2 border-emerald-600 bg-emerald-100 px-4 py-3 text-emerald-950"><div><div className="font-semibold">✓ {c.name}</div><div className="text-xs">{c.followersSignal?.trim()?`${c.followersSignal.trim()} followers`:"Followers not recorded"}</div></div><button disabled={readOnlyPreview || savingId===c.id} onClick={()=>void simple(c,"undo_sent")} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm">Undo</button></li>)}</ul></section>}

    </div>
  );
}
