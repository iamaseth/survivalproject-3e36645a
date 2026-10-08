import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CREATORS, useCreatorsVersion, refreshCreatorsFromDB, type CreatorRow } from "@/lib/creator-partnerships";
import { amICreatorApprover, sethReviewCreator, sethSaveDmDraft } from "@/lib/creators.functions";
import { buildDmPrompt, copyText, copyTextNow } from "@/lib/seth-dm-prompt";
import { TIKTOK_PROFILE_RE } from "@/lib/tiktok-dm-verification";
import { externalLinkProps } from "@/lib/external-link";

export const SETH_SCREEN_RE = /\[TikTok master import\][^\n]*screening[^\n]*/gi;

export function isSethCandidate(c: CreatorRow) {
  return Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok)) && c.qualificationStatus === "Qualified" &&
    !c.contactedDate && !c.outreachSentAt && !/not relevant|dm blocked|do not contact/i.test(c.responseFollowup || "");
}

// Renders nothing unless the server confirms this account is on the approver allowlist.
// All writes are also enforced server-side (seth_review_creator / seth_save_dm_draft).
export function SethReviewPanel() {
  const check = useServerFn(amICreatorApprover);
  const version = useCreatorsVersion();
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [done, setDone] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [, force] = useState(0);
  useEffect(() => { check().then((r) => setAllowed(r.approver === true)).catch(() => setAllowed(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (allowed) refreshCreatorsFromDB().catch(() => {}).finally(() => setLoaded(true)); }, [allowed]);
  const rows = useMemo(() => {
    void version;
    const good = (c: CreatorRow) => /screening[^\n]*Decision Good/i.test(c.researchNotes || "") ? 0 : 1;
    return CREATORS.filter((c) => isSethCandidate(c) && !c.sethApprovalStatus && !skipped.includes(c.id))
      .sort((a, b) => good(a) - good(b) || a.name.localeCompare(b.name));
  }, [version, skipped, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const approvedQueue = useMemo(() => { void version; return CREATORS.filter((c) => c.sethApprovalStatus === "approved" && !c.contactedDate && !c.outreachSentAt).length; }, [version, done]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!allowed) return null;
  return (
    <section id="seth-review" className="overflow-hidden rounded-xl border-2 border-primary/40 bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Seth Review <span className="ml-1 text-sm font-normal text-muted-foreground">({rows.length} to review · {approvedQueue} approved in shared DM queue · {done} this session)</span></div>
          <div className="text-xs text-muted-foreground">Only Seth-approved creators go to the shared DM queue (Rena, Seth, BoBo). "Ready for Outreach" below is NOT approved — it's unverified.</div>
        </div>
        <span className="rounded-md border border-input bg-background px-2.5 py-1 text-xs">{open ? "Close" : "Open"}</span>
      </button>
      {open ? (
        <div className="border-t border-border">
          <p className="bg-secondary/40 px-3 py-2 text-xs"><b>1</b> Click @handle — prompt copies + TikTok opens · <b>2</b> Screenshot profile · <b>3</b> Paste prompt + screenshot into ChatGPT · <b>4</b> Paste DM → Save &amp; Approve, or Not relevant. <Link to="/seth-approval" className="ml-2 underline">Approved / Rejected / Undo</Link></p>
          {!loaded ? <div className="px-4 py-4 text-sm text-muted-foreground">Loading…</div> : rows.length === 0 ? <div className="px-4 py-4 text-sm text-muted-foreground">Nothing to review.</div> : (
            <div className="divide-y divide-border">
              {rows.slice(0, 50).map((c, i) => (
                <SethReviewRow key={c.id} c={c} active={(activeId ?? rows[0]?.id) === c.id} onActivate={() => setActiveId(c.id)}
                  onDone={() => { setActiveId(rows[i + 1]?.id ?? null); setDone((n) => n + 1); force((n) => n + 1); }}
                  onSkip={() => { setActiveId(rows[i + 1]?.id ?? null); setSkipped((s) => [...s, c.id]); }} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

const GENERIC_DM_RE = /natural fit for the preparedness content you already share|I came across your content/i;

export function SethReviewRow({ c, active, onActivate, onDone, onSkip }: { c: CreatorRow; active: boolean; onActivate: () => void; onDone: () => void; onSkip: () => void }) {
  const review = useServerFn(sethReviewCreator);
  const saveDraftFn = useServerFn(sethSaveDmDraft);
  const screening = ((c.researchNotes || "").match(SETH_SCREEN_RE) || []).map((s) => s.replace("[TikTok master import] ", ""));
  const prompt = buildDmPrompt(c, screening);
  const handle = c.tiktok?.match(/@([^/?#]+)/)?.[1] ?? c.name;
  const [dm, setDm] = useState(c.personalizedDm || "");
  const [savedDm, setSavedDm] = useState(c.personalizedDm || "");
  const [draftSaved, setDraftSaved] = useState(false);
  const [checked, setChecked] = useState(false);
  const [copyState, setCopyState] = useState<"" | "ok" | "fail">("");
  const [busy, setBusy] = useState(false);
  const locked = Boolean(c.contactedDate || c.outreachSentAt);
  const badOutput = /^\s*(NOT RELEVANT|NEEDS MANUAL REVIEW)/i.test(dm);
  const generic = GENERIC_DM_RE.test(savedDm);
  const dirty = dm.trim() !== savedDm.trim();
  const isGood = /screening[^\n]*Decision Good/i.test(c.researchNotes || "");
  const status = locked ? "Contacted — locked" : draftSaved ? "New DM saved" : !savedDm.trim() ? "No DM" : generic ? "Generic DM" : "Has DM";

  // Copy synchronously within the click, then let the link open TikTok normally.
  const onLinkClick = () => {
    onActivate();
    const ok = copyTextNow(prompt);
    setCopyState(ok ? "ok" : "fail");
    if (ok) toast.success(`Prompt for @${handle} copied — TikTok opening`);
  };
  const copyAgain = async () => {
    const ok = await copyText(prompt);
    setCopyState(ok ? "ok" : "fail");
    if (ok) toast.success("Prompt copied"); else toast.error("Copy blocked — select the text in the box");
  };
  const saveDraft = async () => {
    if (busy) return; setBusy(true);
    try {
      await saveDraftFn({ data: { id: c.id, dm: dm.trim(), note: "ChatGPT-assisted manual rewrite from profile" } });
      c.personalizedDm = dm.trim(); setSavedDm(dm.trim()); setDraftSaved(true);
      toast.success("DM saved (not approved yet)");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };
  const decide = async (decision: "approved" | "rejected", approvedDm?: string) => {
    if (busy) return; setBusy(true);
    const note = decision === "rejected" ? "Not relevant (Seth row review)" : "Profile checked; ChatGPT-assisted DM";
    try {
      await review({ data: { id: c.id, decision, dm: decision === "approved" ? (approvedDm ?? savedDm) : undefined, note, checkedProfile: checked, messageFits: checked } });
      c.sethApprovalStatus = decision; c.sethApprovedAt = new Date().toISOString(); c.sethApprovalNote = note;
      toast.success(decision === "approved" ? `@${handle} approved — now in the shared DM queue` : `@${handle} marked not relevant — undo under Rejected`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };
  const canApprove = !busy && !locked && checked && !!dm.trim() && !badOutput && (dirty || draftSaved) && !GENERIC_DM_RE.test(dm);
  const saveAndApprove = async () => {
    if (!canApprove) return;
    if (dirty) {
      setBusy(true);
      try { await saveDraftFn({ data: { id: c.id, dm: dm.trim(), note: "ChatGPT-assisted manual rewrite from profile" } }); c.personalizedDm = dm.trim(); setSavedDm(dm.trim()); setDraftSaved(true); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); setBusy(false); return; }
      setBusy(false);
    }
    await decide("approved", dm.trim());
  };

  return (
    <div className={active ? "bg-secondary/30 p-3" : ""}>
      <div className={`flex items-center gap-3 ${active ? "" : "cursor-pointer px-3 py-2 hover:bg-secondary/20"}`} onClick={active ? undefined : onActivate}>
        <a {...externalLinkProps(c.tiktok)} onClick={(e) => { e.stopPropagation(); onLinkClick(); }} className="font-medium text-primary underline">@{handle} ↗</a>
        <span className="truncate text-xs text-muted-foreground">{c.name.replace(/^@/, "") !== handle ? c.name : ""}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px]">
          {isGood ? <span className="rounded bg-secondary px-1.5 py-0.5">Good (indirect)</span> : null}
          <span className={`rounded px-1.5 py-0.5 ${status === "Generic DM" || status === "No DM" ? "bg-destructive/15 text-destructive" : "bg-secondary"}`}>{status}</span>
        </span>
      </div>
      {active ? (
        <div className="mt-2 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span>{copyState === "ok" ? "✓ Prompt copied — screenshot the profile, paste both into ChatGPT." : copyState === "fail" ? "Clipboard blocked — use Copy prompt or select the box." : "Click the @handle to copy the prompt and open TikTok."}</span>
            <button onClick={() => void copyAgain()} className="rounded-md border border-input bg-background px-2 py-1">Copy prompt</button>
          </div>
          {copyState === "fail" ? <textarea readOnly value={prompt} rows={5} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]" /> : null}
          {screening.length ? <p className="text-muted-foreground"><b>Screening (indirect, unverified):</b> {screening[0].slice(0, 220)}{screening[0].length > 220 ? "…" : ""}</p> : null}
          <textarea disabled={locked} value={dm} onChange={(e) => setDm(e.target.value)} rows={5} placeholder="Paste ChatGPT's DM here" className="w-full rounded-md border border-input bg-background p-2 text-sm" />
          {badOutput ? <p className="text-destructive">ChatGPT says not a fit — click Not relevant.</p> : null}
          {!draftSaved && !locked ? <p className="text-muted-foreground">Approve needs a new, specific DM (the old stock DM can't be approved) and the checkbox ticked.</p> : null}
          <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I checked the real TikTok profile and this DM fits it</label>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || locked || !dm.trim() || !dirty || badOutput} onClick={() => void saveDraft()} className="rounded-md border border-primary px-3 py-1.5 font-medium text-primary disabled:opacity-40">Save DM</button>
            <button disabled={!canApprove} onClick={() => void saveAndApprove()} className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-40">Save & Approve → shared DM queue</button>
            <button disabled={busy} onClick={() => void decide("rejected")} className="rounded-md border border-destructive px-3 py-1.5 text-destructive">Not relevant → next</button>
            <button disabled={busy} onClick={onSkip} className="px-2 py-1.5 text-muted-foreground">Skip</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
