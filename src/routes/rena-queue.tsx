import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CREATORS, hydrateCreatorsFromDB, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { getMyOutreachSender, outreachPoolAction, senderRejectAssigned, secondLookAction, getOutreachTodayActivity, type OutreachActivityRow } from "@/lib/creators.functions";
import { inRenaPool, isBlockedFollowup } from "@/lib/rena-queue-eligibility";

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
const blocked = (c: CreatorRow) => isBlockedFollowup(c.responseFollowup) || c.qualificationStatus === "Not Relevant" || c.sethApprovalStatus === "rejected";
const inPool = (c: CreatorRow) => inRenaPool(c);
function statusOf(c: CreatorRow): "available" | "assigned" | "contacted" | "blocked" {
  if (c.outreachSentAt || c.contactedDate) return "contacted";
  if (blocked(c)) return "blocked";
  return c.outreachAssignee ? "assigned" : "available";
}

export function DmQueue({ sender = "Rena" }: { sender?: "Rena" | "Seth" }) {
  const version = useCreatorsVersion();
  const who = useServerFn(getMyOutreachSender);
  const act = useServerFn(outreachPoolAction);
  const senderReject = useServerFn(senderRejectAssigned);
  const secondLookAct = useServerFn(secondLookAction);
  const [me, setMe] = useState<{ sender: string | null; approver: boolean } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "err"; text: string; dm?: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [previewSender, setPreviewSender] = useState<string | null>(sender);
  const viewingSender = previewSender ?? me?.sender ?? null;
  const readOnlyPreview = !Boolean(me?.sender || me?.approver);
  const lock = useRef(false);
  const touchStart = useRef<{id:string;x:number;y:number}|null>(null);
  const [swipingId,setSwipingId] = useState<string|null>(null);
  const [actionsId,setActionsId] = useState<string|null>(null);
  
  const deferCreator = async (id: string) => { if (lock.current) return; lock.current=true; setSavingId(id); try { const result=await secondLookAct({data:{id,action:"later"}}); if(!result?.ok) throw new Error("Could not save Later"); await refresh(); setActionsId(null); setNotice({kind:"ok",text:"Moved to Seth’s Second Look list."}); } catch(e) { setNotice({kind:"err",text:e instanceof Error?e.message:"Could not save Later"}); } finally {lock.current=false;setSavingId(null);} };
  const activityFn = useServerFn(getOutreachTodayActivity);
  const [activity,setActivity] = useState<OutreachActivityRow[]>([]);
  const [activityError,setActivityError] = useState<string|null>(null);
  const refreshActivity = async () => { try { setActivity(await activityFn());setActivityError(null); } catch(e) { setActivityError(e instanceof Error?e.message:"Could not load activity"); } };

  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/rena-sw.js").catch(() => {}); }, []);
  useEffect(() => { who().then(setMe).catch(() => setMe({ sender: null, approver: false })); void hydrateCreatorsFromDB().catch(e => setLoadError(e instanceof Error ? e.message : "Could not load outreach queue")); void refreshActivity(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useMemo(() => { void version; return CREATORS.filter(inPool).sort((a, b) => a.name.localeCompare(b.name)); }, [version]);
  const mine = pool.filter((c) => !c.outreachSentAt);
  const pending = mine.filter(c=>!c.outreachSentAt && !c.outreachSecondLookAt);
  const todayLatest = new Map<string,OutreachActivityRow>();
  for(const entry of activity) if(!todayLatest.has(entry.creator_id)) todayLatest.set(entry.creator_id,entry);
  const completedToday = [...todayLatest.values()].filter(a=>["sent","rejected","later"].includes(a.action));
  const available = pool.filter((c) => statusOf(c) === "available");
  const done = completedToday.length;
  const completedIds = new Set(completedToday.map(a=>a.creator_id));
  const tiles = [...pending.filter(c=>!completedIds.has(c.id)), ...completedToday.map(a=>CREATORS.find(c=>c.id===a.creator_id)).filter((c):c is CreatorRow=>Boolean(c))];

  const refresh = async () => { try { setLoadError(null); await hydrateCreatorsFromDB(); await refreshActivity(); } catch(e) { setLoadError(e instanceof Error ? e.message : "Could not refresh outreach queue"); } };

  const run = async (c: CreatorRow, action: "claim" | "release" | "sent" | "undo_sent") => {
    const result = await act({ data: { id: c.id, action } });
    if (!result?.ok) throw new Error("Server did not confirm the action.");
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
    try { await run(c, action); setActionsId(null); setNotice({ kind: "ok", text: action === "claim" ? `${c.name} is yours.` : action === "release" ? `${c.name} returned to the pool.` : action === "sent" ? `${c.name} marked sent.` : `${c.name} undone.` }); }
    catch (e) { setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not save" }); void refresh(); }
    finally { lock.current = false; setSavingId(null); }
  };

  const reject = async (c:CreatorRow) => {
    if (readOnlyPreview || lock.current || c.outreachSentAt) return;
    if (!confirm(`Reject ${c.name} as Not Relevant and remove from your queue?`)) return;
    lock.current=true;setSavingId(c.id);
    try { const result = await senderReject({data:{id:c.id,reason:`Rena queue rejection by ${me?.sender ?? "sender"}: Not Relevant`,checkedProfile:true}}); if (!result?.ok) throw new Error("Server did not confirm rejection."); await refresh(); setActionsId(null); setNotice({kind:"ok",text:`${c.name} rejected as Not Relevant. History kept.`}); }
    catch(e){setNotice({kind:"err",text:e instanceof Error?e.message:"Could not reject creator"});}
    finally {lock.current=false;setSavingId(null);}
  };

  const swipeReject = (c:CreatorRow, x:number, y:number) => {
    const start=touchStart.current; touchStart.current=null;
    if (!start || start.id!==c.id || c.outreachSentAt) return;
    if (start.x-x>70 && Math.abs(start.y-y)<55 && !lock.current) {
      setSwipingId(c.id); // suppress the synthetic click that would open TikTok
      window.setTimeout(()=>setSwipingId(v=>v===c.id?null:v), 600);
      if (!readOnlyPreview) void reject(c);
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
          {readOnlyPreview ? <p className="text-xs text-muted-foreground">You must be signed in as an authorized team member to update CRM records.</p> : null}
        </div>
        <button onClick={() => void refresh()} className="rounded-md border border-input px-3 py-2 text-sm">Refresh</button>
      </div>
      <div className="sticky top-0 z-10 rounded-xl border border-border bg-card p-3">
        <div className="flex justify-between text-sm font-semibold"><span>{done} done today</span><span>{pending.filter(c=>!completedIds.has(c.id)).length} left</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${mine.length ? (done / mine.length) * 100 : 0}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Finished tiles turn green (Sent), red (Rejected), or amber (Later). Completed work remains visible until tomorrow.</p>
      </div>
      {loadError ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{loadError}</p> : null}
      {notice ? (
        <div role="status" className={`rounded-lg border-2 p-3 text-sm ${tone[notice.kind]}`}>
          <div className="font-medium">{notice.text}</div>
          {notice.dm ? <textarea readOnly value={notice.dm} rows={4} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded border border-input bg-background p-2 text-sm text-foreground" /> : null}
        </div>
      ) : null}
      {tiles.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><div className="text-base font-semibold text-foreground">No pending creators</div>Approved creators will appear here.</div> : null}
      <ul className="space-y-2">
        {tiles.map((c) => {
          const completedAction = completedIds.has(c.id) ? todayLatest.get(c.id)?.action : undefined;
          const finished = Boolean(completedAction);
          const sent = Boolean(c.outreachSentAt);
          return (
            <li key={c.id} className="flex flex-wrap items-stretch gap-2" onTouchStart={e=>{if(finished)return;const t=e.touches[0];touchStart.current={id:c.id,x:t.clientX,y:t.clientY};}} onTouchEnd={e=>{if(finished)return;const t=e.changedTouches[0];swipeReject(c,t.clientX,t.clientY);}}>
              <a href={finished ? undefined : c.tiktok!} target="_blank" rel="noopener noreferrer" aria-disabled={finished || savingId === c.id}
                onClick={(e) => { if (finished || lock.current || swipingId===c.id) { e.preventDefault(); return; } onTap(c); }}
                className={`flex min-h-[76px] flex-1 flex-col justify-center rounded-xl border-2 px-4 py-3 ${completedAction==="sent" ? "border-emerald-600 bg-emerald-100 text-emerald-950" : completedAction==="rejected" ? "border-red-600 bg-red-100 text-red-950" : completedAction==="later" ? "border-amber-600 bg-amber-100 text-amber-950" : "border-border bg-card text-foreground active:bg-secondary"}`}>
                <span className="text-base font-semibold">{finished ? "✓ " : ""}{c.name}</span>
                <span className="text-xs opacity-75">{c.followersSignal?.trim() ? `${c.followersSignal.trim()} followers` : "Followers not recorded"}{savingId === c.id ? " · saving…" : finished ? ` · ${completedAction==="sent"?"Sent":completedAction==="rejected"?"Rejected — Not Relevant":"Later — Seth Review"}` : ""}</span>
              </a>
              {!finished && !readOnlyPreview && <button type="button" disabled={savingId===c.id} onClick={()=>void simple(c,"sent")} className="rounded-xl bg-emerald-700 px-3 text-sm font-semibold text-white">Sent</button>}
              {!finished && <button type="button" onClick={()=>setActionsId(v=>v===c.id?null:c.id)} className="rounded-xl border border-border px-3 text-sm" aria-label={`Actions for ${c.name}`}>•••</button>}
              {actionsId===c.id && <div className="basis-full grid w-full grid-cols-4 gap-1 rounded-xl border p-2 text-xs font-medium">
                <button type="button" disabled={readOnlyPreview || !sent} onClick={()=>{setActionsId(null);void simple(c,"undo_sent");}} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-blue-100 text-blue-900 disabled:opacity-40"><span className="text-xl">↶</span>Undo</button>
                <button type="button" disabled={readOnlyPreview || sent} onClick={()=>void reject(c)} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-red-100 text-red-900 disabled:opacity-40"><span className="text-xl">✕</span>Reject</button>
                <button type="button" onClick={()=>{void deferCreator(c.id);}} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-amber-100 text-amber-900"><span className="text-xl">◷</span>Later</button>
                <button type="button" disabled={readOnlyPreview || sent} onClick={()=>{setActionsId(null);void simple(c,"sent");}} className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-green-100 text-green-900 disabled:opacity-40"><span className="text-xl">✓</span>Sent</button>
              </div>}
            </li>
          );
        })}
      </ul>


    </div>
  );
}
