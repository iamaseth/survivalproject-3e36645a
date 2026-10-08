import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CREATORS, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { amICreatorApprover, outreachPoolAction, sethReviewCreator, sethSaveDmDraft } from "@/lib/creators.functions";
import { buildDmPrompt, copyText } from "@/lib/seth-dm-prompt";
import { hydrateCreatorsFromDB, refreshCreatorsFromDB } from "@/lib/creator-partnerships";
import { TIKTOK_PROFILE_RE } from "@/lib/tiktok-dm-verification";
import { externalLinkProps } from "@/lib/external-link";

export const Route = createFileRoute("/seth-approval")({
  head: () => ({
    meta: [
      { title: "Seth Approval — Survival Tabs" },
      { name: "description", content: "Seth personally approves TikTok creators and DMs before they reach Rena." },
      { property: "og:title", content: "Seth Approval — Survival Tabs" },
      { property: "og:description", content: "Approve, reject or skip TikTok creators for Rena's DM list." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SethApproval,
});

const SCREEN_RE = /\[TikTok master import\][^\n]*screening[^\n]*/gi;

function candidate(c: CreatorRow) {
  return Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok)) && c.qualificationStatus === "Qualified" &&
    !c.contactedDate && !/not relevant|dm blocked|do not contact/i.test(c.responseFollowup || "");
}

function SethApproval() {
  const version = useCreatorsVersion();
  const check = useServerFn(amICreatorApprover);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"pending" | "rejected" | "approved">("pending");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [, force] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ok" | string>("loading");
  const reload = () => {
    setLoadState("loading");
    refreshCreatorsFromDB().then(() => setLoadState("ok")).catch((e) => setLoadState(e instanceof Error ? e.message : "Could not load creators"));
  };
  useEffect(() => { if (allowed) reload(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { check().then((r) => setAllowed(r.approver)).catch(() => setAllowed(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lists = useMemo(() => {
    void version;
    const base = CREATORS.filter(candidate);
    const screened = (c: CreatorRow) => /screening[^\n]*Decision Good/i.test(c.researchNotes || "") ? 0 : 1;
    return {
      good: base.filter((c) => screened(c) === 0).length,
      pending: base.filter((c) => !c.sethApprovalStatus && !skipped.includes(c.id)).sort((a, b) => screened(a) - screened(b) || a.name.localeCompare(b.name)),
      rejected: CREATORS.filter((c) => c.sethApprovalStatus === "rejected"),
      approved: CREATORS.filter((c) => c.sethApprovalStatus === "approved"),
    };
  }, [version, skipped]);

  if (allowed === null) return <div className="p-8 text-sm text-muted-foreground">Checking access…</div>;
  if (!allowed) return (
    <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-sm">
      <h1 className="font-display text-2xl">Seth Approval</h1>
      <p className="mt-2">This page is only for Seth's account. Your account can't approve creators.</p>
    </div>
  );

  const rows = lists[tab];
  if (loadState === "loading") return <div className="p-8 text-sm text-muted-foreground">Loading creators from the database…</div>;
  if (loadState !== "ok") return (
    <div className="mx-auto max-w-lg rounded-xl border border-destructive p-6 text-sm">
      <p>Couldn't load creators: {loadState}</p>
      <button onClick={reload} className="mt-3 rounded-md border border-input px-3 py-1.5">Try again</button>
    </div>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-3xl text-foreground">Seth Approval</h1>
        <p className="text-sm text-muted-foreground">Open each TikTok profile yourself. Only creators you approve appear on Rena's DM list.</p>
      </div>
      <div className="flex gap-2 text-sm">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "border border-input"}`}>
            {t === "pending" ? "To review" : t === "approved" ? "Approved" : "Rejected"} ({lists[t].length})
          </button>
        ))}
        <span className="self-center text-xs text-muted-foreground">{lists.good} Good-screened shown first</span>
        {skipped.length ? <button onClick={() => setSkipped([])} className="ml-auto text-xs underline">Show {skipped.length} skipped</button> : null}
      </div>
      {rows.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">Nothing here.</div> : null}
      {rows.slice(0, 10).map((c) => (
        <Card key={c.id} c={c} onDone={() => force((n) => n + 1)} onSkip={() => setSkipped((s) => [...s, c.id])} />
      ))}
    </div>
  );
}

function Card({ c, onDone, onSkip }: { c: CreatorRow; onDone: () => void; onSkip: () => void }) {
  const review = useServerFn(sethReviewCreator);
  const [dm, setDm] = useState(c.personalizedDm || "");
  const [checked, setChecked] = useState(false);
  const [fits, setFits] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const screening = (c.researchNotes || "").match(SCREEN_RE) || [];
  const cleanScreening = screening.map((s) => s.replace("[TikTok master import] ", ""));
  const prompt = buildDmPrompt(c, cleanScreening);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const locked = Boolean(c.contactedDate || c.outreachSentAt);
  const badOutput = /^\s*(NOT RELEVANT|NEEDS MANUAL REVIEW)/i.test(dm);
  const copyPrompt = async () => {
    const ok = await copyText(prompt);
    setCopyFailed(!ok); setCopied(ok);
    if (ok) { toast.success("ChatGPT prompt copied — paste it into ChatGPT"); setTimeout(() => setCopied(false), 2500); }
    else toast.error("Couldn't copy automatically — copy it from the box");
  };
  const saveDraftFn = useServerFn(sethSaveDmDraft);
  const saveDraft = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveDraftFn({ data: { id: c.id, dm: dm.trim(), note: "ChatGPT-assisted manual rewrite" } });
      c.personalizedDm = dm.trim();
      toast.success(`Draft DM saved for ${c.name} (not approved)`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save draft"); }
    finally { setBusy(false); }
  };

  const pool = useServerFn(outreachPoolAction);
  const assign = async (target: string) => {
    setBusy(true);
    try { await pool({ data: { id: c.id, action: "assign", target } }); await hydrateCreatorsFromDB(); toast.success(`${c.name} assigned to ${target}`); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not assign"); }
    finally { setBusy(false); }
  };
  const act = async (decision: "approved" | "rejected" | "cleared") => {
    if (busy) return;
    setBusy(true);
    try {
      await review({ data: { id: c.id, decision, dm: decision === "approved" ? dm : undefined, note, checkedProfile: checked, messageFits: fits } });
      if (decision === "approved") c.personalizedDm = dm.trim();
      c.sethApprovalStatus = decision === "cleared" ? null : decision;
      c.sethApprovedAt = new Date().toISOString(); c.sethApprovalNote = note;
      toast.success(decision === "approved" ? `${c.name} approved for Rena` : decision === "rejected" ? `${c.name} rejected` : `${c.name} back to review`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{c.name}</h2>
        <a {...externalLinkProps(c.tiktok)} className="break-all text-sm font-medium text-primary underline">Open TikTok profile ↗</a>
      </div>
      {screening.length ? (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-950">
          <b>Screening (indirect — not a TikTok check):</b>
          {screening.map((s, i) => <p key={i} className="mt-1 break-words">{s.replace("[TikTok master import] ", "")}</p>)}
        </div>
      ) : <p className="text-xs text-muted-foreground">No screening evidence saved.</p>}
      {c.verificationEvidence ? <p className="text-xs"><b>Researcher evidence:</b> {c.verificationEvidence}</p> : null}
      {c.sethApprovalStatus ? (
        <div className="flex items-center justify-between rounded-md bg-secondary/40 p-2 text-sm">
          <span>{c.sethApprovalStatus === "approved" ? "Approved" : "Rejected"}{c.sethApprovedAt ? ` · ${c.sethApprovedAt.slice(0, 10)}` : ""}{c.sethApprovalNote ? ` · ${c.sethApprovalNote}` : ""}</span>
          {c.sethApprovalStatus === "approved" && !c.outreachSentAt && !c.contactedDate ? (
            <select disabled={busy} value={c.outreachAssignee ?? ""} onChange={(e) => void assign(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
              <option value="" disabled>Assign sender…</option>
              {["Seth", "BoBo", "Rena"].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : c.outreachSentBy ? <span className="text-xs">Sent by {c.outreachSentBy}</span> : null}
          <button disabled={busy} onClick={() => void act("cleared")} className="rounded-md border border-input px-3 py-1 text-xs">Undo → back to review</button>
        </div>
      ) : (
        <>
          <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3 text-xs">
            <p><b>1.</b> Copy the prompt → paste into ChatGPT (attach a screenshot of the real TikTok profile if you can). <b>2.</b> Paste the improved DM below → Save draft. <b>3.</b> Approve separately when ready.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={locked} onClick={() => void copyPrompt()} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium disabled:opacity-40">{copied ? "✓ Prompt copied" : "Copy ChatGPT prompt"}</button>
              {copyFailed ? <span className="text-destructive">Clipboard blocked — select and copy the prompt below.</span> : null}
            </div>
            {copyFailed ? <textarea readOnly value={prompt} rows={6} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]" /> : null}
          </div>
          <label className="block text-xs font-medium">Personalized DM (paste improved version here)
            <textarea disabled={locked} value={dm} onChange={(e) => setDm(e.target.value)} rows={6} className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" placeholder="No DM saved — write one to approve" />
          </label>
          {badOutput ? <p className="text-xs text-destructive">ChatGPT said this creator is not a fit / needs review — don't save this as a DM. Reject or skip instead.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy || locked || !dm.trim() || badOutput || dm.trim() === (c.personalizedDm || "").trim()} onClick={() => void saveDraft()} className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary disabled:opacity-40">Save draft</button>
            <span className="text-xs text-muted-foreground">{locked ? "Already contacted — DM locked." : "Saves the DM only. Not approved, not sent to anyone. Old DM kept in history."}</span>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />I personally checked this real TikTok profile</label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={fits} onChange={(e) => setFits(e.target.checked)} className="mt-1" />This message fits this creator</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional; reason if rejecting)" className="w-full rounded-md border border-input bg-background p-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || locked || badOutput || !checked || !fits || !dm.trim()} onClick={() => void act("approved")} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Approve → Rena</button>
            <button disabled={busy} onClick={() => void act("rejected")} className="rounded-md border border-input px-4 py-2 text-sm">Reject</button>
            <button disabled={busy} onClick={onSkip} className="rounded-md px-4 py-2 text-sm text-muted-foreground">Skip</button>
          </div>
        </>
      )}
    </section>
  );
}
