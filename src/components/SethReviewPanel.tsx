import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CREATORS, refreshCreatorsFromDB, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { amICreatorApprover, sethReviewCreator, sethSaveDmDraft } from "@/lib/creators.functions";
import { hasGroundedDm, isFinalApprovalReady } from "@/lib/final-approval";
import { externalLinkProps } from "@/lib/external-link";

export function SethReviewPanel() {
  const check = useServerFn(amICreatorApprover);
  const version = useCreatorsVersion();
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { check().then(r => setAllowed(r.approver)).catch(() => setAllowed(false)); }, []);
  useEffect(() => { if (allowed) refreshCreatorsFromDB().catch(() => setError("Could not load creators. Reload to retry.")).finally(() => setLoaded(true)); }, [allowed]);
  const rows = useMemo(() => CREATORS.filter(c => c.tiktok && c.qualificationStatus === "Qualified" && !c.contactedDate && c.sethApprovalStatus !== "approved" && c.sethApprovalStatus !== "rejected").sort((a,b) => a.name.localeCompare(b.name)), [version, revision]);
  if (!allowed) return null;
  return <section className="overflow-hidden rounded-xl border border-border bg-card">
    <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      <div className="grid h-7 w-7 place-items-center rounded-full bg-emerald-700 text-white">1</div>
      <div className="min-w-0 flex-1 font-semibold">Qualified Influencers <span className="text-sm font-normal text-muted-foreground">({loaded && !error ? rows.length : "—"})</span></div>
      <span className="text-xs text-muted-foreground">{open ? "Close" : "Open"}</span>
    </button>
    {open && <div className="border-t border-border">{error ? <p role="alert" className="p-4 text-destructive">{error}</p> : !loaded ? <p className="p-4">Loading…</p> : rows.length ? rows.map(c => <QualifiedRow key={c.id} c={c} onDone={() => setRevision(n => n + 1)} />) : <p className="p-4 text-sm text-muted-foreground">No qualified creators awaiting review.</p>}</div>}
  </section>;
}

function QualifiedRow({c,onDone}:{c:CreatorRow;onDone:()=>void}) {
  const review = useServerFn(sethReviewCreator);
  const saveDraft = useServerFn(sethSaveDmDraft);
  const busyRef = useRef(false);
  const [busy,setBusy] = useState(false);
  const [showPaste,setShowPaste] = useState(false);
  const [dm,setDm] = useState("");
  const [error,setError] = useState("");
  const handle = c.tiktok?.match(/@([^/?#]+)/)?.[1] ?? c.name;
  const copy = async () => {
    const prompt = `Review this TikTok creator for Survival Tabs. Use the actual profile clip I paste below. Decide APPROVE or REJECT based only on evidence. If APPROVE, write a creator-specific, non-generic DM with no unsupported claims. Return a short evidence summary and the DM. Creator: @${handle}\nProfile: ${c.tiktok}\nPrior research (may be unverified): ${c.researchNotes || "None"}\nPrevious DM (may be generic): ${c.personalizedDm || "None"}\n\n[PASTE OBSIDIAN WEB CLIP HERE]`;
    try { await navigator.clipboard.writeText(prompt); toast.success("Copied creator research prompt"); } catch { setError("Clipboard unavailable; use a secure browser context."); }
  };
  const act = async (decision:"approved"|"rejected") => {
    if (busyRef.current) return;
    if (decision === "approved" && (!isFinalApprovalReady(c) || !hasGroundedDm(c.verificationEvidence || "",dm))) {
      setError("Saved draft only. Direct profile evidence must be verified before outreach approval.");
      if (dm.trim()) { try { await saveDraft({data:{id:c.id,dm:dm.trim(),note:"User pasted revised DM; direct verification still required"}}); toast.success("DM draft saved for verification"); } catch(e) { setError(e instanceof Error ? e.message : "Could not save draft"); } }
      return;
    }
    busyRef.current=true;setBusy(true);setError("");
    try {
      await review({data:{id:c.id,decision,dm:decision==="approved"?dm.trim():undefined,note:decision==="approved"?"User reviewed profile and pasted personalized DM":"Rejected from qualified review",checkedProfile:decision==="approved",messageFits:decision==="approved"}});
      c.sethApprovalStatus=decision;
      if(decision==="approved") c.personalizedDm=dm.trim();
      toast.success(decision==="approved"?"Approved for shared outreach":"Rejected");
      onDone();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save decision"); }
    finally {busyRef.current=false;setBusy(false);}
  };
  return <div className="border-b border-border px-4 py-3 last:border-0">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto min-w-32 break-all text-sm font-medium">@{handle}</span>
      <a {...externalLinkProps(c.tiktok)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">Open Profile ↗</a>
      <button type="button" onClick={() => void copy()} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">Copy</button>
      <button type="button" onClick={() => setShowPaste(v=>!v)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">Paste</button>
      <button type="button" disabled={busy} onClick={() => void act("rejected")} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">Reject</button>
    </div>
    {showPaste && <div className="mt-3 space-y-2"><label className="block text-xs font-medium">Paste personalized DM from ChatGPT<textarea value={dm} onChange={e=>setDm(e.target.value)} rows={5} maxLength={2000} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" /></label><button type="button" disabled={busy || !dm.trim()} onClick={()=>void act("approved")} className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">Save DM and approve if verified</button><p className="text-xs text-muted-foreground">Unverified creators remain in review; saving a DM never bypasses evidence checks.</p></div>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}
