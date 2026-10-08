import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [done, setDone] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => { check().then((r) => setAllowed(r.approver === true)).catch(() => setAllowed(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (allowed) refreshCreatorsFromDB().catch(() => setLoadError("Could not load creators. Reload to retry.")).finally(() => setLoaded(true)); }, [allowed]);
  const rows = useMemo(() => {
    void version;
    const good = (c: CreatorRow) => /screening[^\n]*Decision Good/i.test(c.researchNotes || "") ? 0 : 1;
    return CREATORS.filter((c) => isSethCandidate(c) && !c.sethApprovalStatus)
      .sort((a, b) => good(a) - good(b) || a.name.localeCompare(b.name));
  }, [version, done]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!allowed) return null;
  return (
    <section id="seth-review" className="overflow-hidden rounded-xl border border-border bg-card">
      <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left hover:bg-secondary/40">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Seth Review <span className="ml-1 text-sm font-normal text-muted-foreground">({loadError ? "—" : rows.length})</span></div>
        </div>
      </Button>
      {open ? (
        <div className="border-t border-border">
          {loadError ? <div role="alert" className="px-4 py-4 text-sm text-destructive">{loadError}</div> : !loaded ? <div className="px-4 py-4 text-sm text-muted-foreground">Loading…</div> : rows.length === 0 ? <div className="px-4 py-4 text-sm text-muted-foreground">Nothing to review.</div> : (
            <div className="divide-y divide-border">
              {rows.slice(0, 50).map((c, i) => (
                <CompactSethReviewRow key={c.id} c={c} active={(activeId ?? rows[0]?.id) === c.id} onActivate={() => setActiveId(c.id)}
                  onDone={() => { setActiveId(rows[i + 1]?.id ?? null); setDone((n) => n + 1); }} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

const GENERIC_DM_RE = /natural fit for the preparedness content you already share|I came across your content/i;

function CompactSethReviewRow({ c, active, onActivate, onDone }: { c: CreatorRow; active: boolean; onActivate: () => void; onDone: () => void }) {
  const review = useServerFn(sethReviewCreator);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  // Never prefill with the existing DM: approval requires a fresh manual paste.
  const [dm, setDm] = useState("");
  const [profileOpened, setProfileOpened] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [error, setError] = useState("");
  const handle = c.tiktok?.match(/@([^/?#]+)/)?.[1] ?? c.name;
  const screening = ((c.researchNotes || "").match(SETH_SCREEN_RE) || []).map((s) => s.replace("[TikTok master import] ", ""));
  const prompt = buildDmPrompt(c, screening);
  const locked = Boolean(c.contactedDate || c.outreachSentAt || c.sethApprovalStatus);
  const newDm = dm.trim();
  const invalidDm = !newDm || newDm === (c.personalizedDm || "").trim() || newDm.length > 2000 || GENERIC_DM_RE.test(newDm) || /^\s*(NOT RELEVANT|NEEDS MANUAL REVIEW)/i.test(newDm);
  const copy = async () => {
    const ok = await copyText(prompt);
    setCopyFailed(!ok);
    if (ok) toast.success("Prompt copied");
    else toast.error("Copy blocked — select the prompt below");
  };
  const decide = async (decision: "approved" | "rejected") => {
    if (inFlight.current || locked) return;
    if (decision === "approved") {
      if (!profileOpened || invalidDm) return;
      // This explicit approval action replaces the two checkboxes, not the review requirement.
      if (!window.confirm("I personally checked the real TikTok profile, and this new DM accurately fits the creator. Approve for outreach?")) return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    const note = decision === "approved" ? "Personally checked real TikTok profile and confirmed new DM fits — explicit Approve confirmation" : "Not Relevant — rejected in Seth Review";
    try {
      // One transactional RPC preserves the previous DM and saves the new DM + approval together.
      await review({ data: { id: c.id, decision, dm: decision === "approved" ? newDm : undefined, note, checkedProfile: decision === "approved", messageFits: decision === "approved" } });
      if (decision === "approved") c.personalizedDm = newDm;
      c.sethApprovalStatus = decision;
      c.sethApprovedAt = new Date().toISOString();
      c.sethApprovalNote = note;
      toast.success(decision === "approved" ? "Approved" : "Rejected — undo in Seth Approval");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div className={active ? "bg-secondary/30 px-4 py-2" : "px-4 py-2"}>
      <div className="flex min-w-0 items-center gap-3">
        <a {...externalLinkProps(c.tiktok)} className="min-w-0 break-all text-sm font-medium text-primary underline" onClick={() => {
          onActivate();
          setProfileOpened(true);
          const ok = copyTextNow(prompt);
          setCopyFailed(!ok);
          if (ok) toast.success("Prompt copied");
        }}>@{handle} ↗</a>
        <Button variant="ghost" size="sm" className="ml-auto shrink-0" disabled={busy} onClick={() => { onActivate(); void copy(); }}>Copy</Button>
      </div>
      {active ? <div className="mt-2 space-y-2">
        {copyFailed ? <div className="space-y-1"><p className="text-xs text-destructive">Clipboard blocked — Copy or select below.</p><textarea aria-label="ChatGPT prompt" readOnly value={prompt} rows={3} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background p-2 text-xs" /></div> : null}
        <textarea aria-label={`Paste DM for @${handle}`} placeholder="Paste DM" disabled={busy || locked} value={dm} maxLength={2000} onChange={(e) => setDm(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background p-2 text-sm" />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || locked || !profileOpened || invalidDm} title="Approve confirms you personally checked the profile and the new DM fits" onClick={() => void decide("approved")}>Approve</Button>
          <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => void decide("rejected")}>Reject</Button>
        </div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div> : null}
    </div>
  );
}

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
