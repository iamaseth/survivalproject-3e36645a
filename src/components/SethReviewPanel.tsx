import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CREATORS, refreshCreatorsFromDB, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { amICreatorApprover, sethReviewCreator, sethSaveDmDraft, recordTikTokDmReview, outreachPoolAction, manualQualificationOverride } from "@/lib/creators.functions";
import { hasGroundedDm } from "@/lib/final-approval";
import { isDmVerified } from "@/lib/tiktok-dm-verification";
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
  const rows = useMemo(() => CREATORS.filter(c => c.tiktok && !c.contactedDate && !c.outreachSentAt && !c.sethApprovalStatus).sort((a,b) => a.name.localeCompare(b.name)), [version, revision]);
  const approved = useMemo(() => CREATORS.filter(c => c.sethApprovalStatus === "approved" && !c.outreachSentAt && !c.contactedDate), [version, revision]);
  const assignApproved = useServerFn(outreachPoolAction);
  const [assigning,setAssigning] = useState<string | null>(null);
  const moveTo = async (c:CreatorRow, person:"Seth"|"Rena") => { setAssigning(c.id); try { await assignApproved({data:{id:c.id,action:"assign",target:person}}); c.outreachAssignee=person; setRevision(n=>n+1); toast.success("Assigned to "+person); } catch(e) { toast.error(e instanceof Error?e.message:"Could not assign creator"); } finally { setAssigning(null); } };
  if (!allowed) return null;
  return <div className="space-y-3"><section className="overflow-hidden rounded-xl border border-border bg-card">
    <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      <div className="grid h-7 w-7 place-items-center rounded-full bg-emerald-700 text-white">1</div>
      <div className="min-w-0 flex-1 font-semibold">Passed First Review <span className="text-sm font-normal text-muted-foreground">({loaded && !error ? rows.length : "—"})</span></div>
      <span className="text-xs text-muted-foreground">{open ? "Close" : "Open"}</span>
    </button>
    {open && <div className="border-t border-border">{error ? <p role="alert" className="p-4 text-destructive">{error}</p> : !loaded ? <p className="p-4">Loading…</p> : rows.length ? rows.map(c => <QualifiedRow key={c.id} c={c} onDone={() => setRevision(n => n + 1)} />) : <p className="p-4 text-sm text-muted-foreground">No qualified creators awaiting review.</p>}</div>}
  </section>
  <section className="rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">2. Approved for Outreach ({approved.length})</h3>{(["Seth", "Rena"] as const).map(person => <details key={person} className="mt-2 rounded border border-border"><summary className="cursor-pointer p-3 font-medium">{person} ({approved.filter(c => c.outreachAssignee === person).length})</summary>{approved.filter(c => c.outreachAssignee === person).map(c => <div key={c.id} className="flex justify-between gap-2 border-t p-3 text-sm"><span>{c.name}</span><a {...externalLinkProps(c.tiktok)} className="underline">Profile</a></div>)}</details>)}<details open className="mt-2 rounded border border-border"><summary className="cursor-pointer p-3 font-medium">Unassigned ({approved.filter(c => !c.outreachAssignee).length})</summary>{approved.filter(c => !c.outreachAssignee).map(c => <div key={c.id} className="flex flex-wrap items-center gap-2 border-t p-3 text-sm"><span className="mr-auto">{c.name}</span><a {...externalLinkProps(c.tiktok)} className="underline">Profile</a><button type="button" disabled={assigning===c.id} onClick={()=>void moveTo(c,"Seth")} className="rounded border px-2 py-1">Assign Seth</button><button type="button" disabled={assigning===c.id} onClick={()=>void moveTo(c,"Rena")} className="rounded border px-2 py-1">Assign Rena</button></div>)}</details></section>
  </div>;
}

function QualifiedRow({c,onDone}:{c:CreatorRow;onDone:()=>void}) {
  const review = useServerFn(sethReviewCreator);
  const manualOverride = useServerFn(manualQualificationOverride);
  const saveDraft = useServerFn(sethSaveDmDraft);
  const assign = useServerFn(outreachPoolAction);
  const verify = useServerFn(recordTikTokDmReview);
  const busyRef = useRef(false);
  const [busy,setBusy] = useState(false);
  const [showPaste,setShowPaste] = useState(false);
  const [dm,setDm] = useState("");
  const [evidence,setEvidence] = useState("");
  const [profileChecked,setProfileChecked] = useState(false);
  const [error,setError] = useState("");
  const [saved,setSaved] = useState(false);
  const [assignee,setAssignee] = useState<"Seth" | "Rena">("Rena");
  const [rawInput,setRawInput] = useState("");
  const handle = c.tiktok?.match(/@([^/?#]+)/)?.[1] ?? c.name;
  const copy = async () => {
    const prompt = `Review this TikTok creator for Survival Tabs. Use the actual profile clip I paste below. Decide APPROVE or REJECT based only on evidence. If APPROVE, write a creator-specific, non-generic DM with no unsupported claims. Return a short evidence summary and the DM. Creator: @${handle}\nProfile: ${c.tiktok}\nPrior research (may be unverified): ${c.researchNotes || "None"}\nPrevious DM (may be generic): ${c.personalizedDm || "None"}\n\n[PASTE OBSIDIAN WEB CLIP HERE]`;
    try { await navigator.clipboard.writeText(prompt); toast.success("Copied creator research prompt"); } catch { setError("Clipboard unavailable; use a secure browser context."); }
  };
  const parseResult = (raw: string) => {
    setError(""); setSaved(false);
    if (!raw.trim()) { setError("Nothing pasted. Copy the complete ChatGPT result first."); return; }
    const match = raw.match(/(?:^|\n)Creator:\s*([^\n]+)/i);
    if (match && !match[1].toLowerCase().includes(handle.toLowerCase())) { setError("Result is for another creator. Nothing saved."); return; }
    const decision = raw.match(/(?:^|\n)Decision:\s*([^\n]+)/i)?.[1] || "";
    if (/REJECT/i.test(decision) || /(?:^|\n)Qualification:\s*Not Relevant/i.test(raw)) { setError("Result recommends rejection. Click Reject to confirm."); return; }
    const dmMatch = raw.match(/(?:^|\n)Personalized DM:\s*\n?([\s\S]*?)(?=\n(?:Outreach|Status|Creator|Profile|Qualification|Decision|Evidence|Fit):|$)/i);
    const extracted = (dmMatch?.[1] || "").trim();
    if (!extracted) { setError("Could not find 'Personalized DM:' in this result. Paste the DM into the editable field."); return; }
    setDm(extracted.slice(0,2000));
    setEvidence(raw.match(/(?:^|\n)Evidence:\s*([^\n]+)/i)?.[1]?.trim() || "");
    toast.success("DM loaded. Save to confirm.");
  };
  const paste = async () => {
    setShowPaste(true); setError("");
    try { const raw = await navigator.clipboard.readText(); setRawInput(raw); parseResult(raw); }
    catch { setError("Clipboard permission blocked. Click the box below and press Ctrl+V, then Load result."); }
  };
  const save = async () => {
    if (busyRef.current || !dm.trim()) return;
    if (/dm blocked|do not contact|do not send|opt.?out|unsubscribe/i.test(c.responseFollowup || "")) { setError("Explicit contact restriction. Approval is blocked."); return; }
    if (c.contactedDate || c.outreachSentAt) { setError("Creator is already marked contacted or sent. Approval is locked; review the existing outreach record."); return; }
    if (!profileChecked) { setError("Open the TikTok profile and confirm you personally reviewed it before approval."); return; }
    if (evidence.trim().length < 40) { setError("Add at least 40 characters of specific profile evidence before approval."); return; }
    if (!hasGroundedDm(evidence, dm)) { setError("The DM must reference at least two specific details from the profile evidence. Revise the message or evidence."); return; }
    busyRef.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      await saveDraft({data:{id:c.id,dm:dm.trim(),note:"Manual review. Profile evidence: "+evidence.slice(0,500)}});
      await verify({data:{id:c.id,decision:"verified",evidence:evidence.trim(),reviewer:"Seth",checks:{profileOpened:true,relevant:true,urlCorrect:true,dmGrounded:true}}});
      await manualOverride({data:{id:c.id,decision:"approved",dm:dm.trim(),evidence:evidence.trim(),assignee,checkedProfile:profileChecked}});
      // Only mark local approval after the server confirms it.
      c.personalizedDm=dm.trim(); c.sethApprovalStatus="approved";
      c.outreachAssignee=assignee;
      c.qualificationStatus="Qualified";
      toast.success("Manually approved and assigned to "+assignee);
      setSaved(true); onDone();
    } catch(e) { setError((e instanceof Error ? e.message : "Could not approve creator") + ". Approval was not confirmed. Refresh to check before retrying."); }
    finally {busyRef.current=false;setBusy(false);}
  };
  const act = async (decision:"approved"|"rejected") => {
    if (busyRef.current) return;
    if (decision === "approved" && (!isDmVerified(c) || !hasGroundedDm(c.verificationEvidence || "",dm))) {
      setError("Saved draft only. Direct profile evidence must be verified before outreach approval.");
      if (dm.trim()) { try { await saveDraft({data:{id:c.id,dm:dm.trim(),note:"User pasted revised DM. Evidence from clip (unverified in database): "+evidence.slice(0,500)}}); toast.success("DM draft saved for verification"); } catch(e) { setError(e instanceof Error ? e.message : "Could not save draft"); } }
      return;
    }
    busyRef.current=true;setBusy(true);setError("");
    try {
      if (decision === "approved") await saveDraft({data:{id:c.id,dm:dm.trim(),note:"User pasted profile-specific DM"}});
      if (decision === "rejected") {
        if (!profileChecked) throw new Error("Check "Profile reviewed" beside Paste before rejecting");
        await manualOverride({data:{id:c.id,decision:"rejected",checkedProfile:true}});
        c.qualificationStatus="Not Relevant";
      } else {
        await review({data:{id:c.id,decision,dm:dm.trim(),note:"User reviewed profile",checkedProfile:true,messageFits:true}});
      }
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
      <button type="button" onClick={() => void paste()} className={`rounded-md border px-3 py-1.5 text-xs ${saved ? "border-emerald-700 bg-emerald-700 text-white" : "hover:bg-secondary"}`}>{saved ? "Saved ✓" : "Paste"}</button>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={profileChecked} onChange={e=>setProfileChecked(e.target.checked)} /> Profile reviewed</label>
      <button type="button" disabled={busy} onClick={() => void act("rejected")} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">Reject</button>
    </div>
    {showPaste && <div className="mt-3 space-y-2"><label className="block text-xs font-medium">Complete ChatGPT result (Ctrl+V if automatic paste is blocked)<textarea value={rawInput} onChange={e=>setRawInput(e.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" /></label><button type="button" onClick={()=>parseResult(rawInput)} className="rounded-md border px-3 py-2 text-xs">Load result</button><label className="block text-xs font-medium">Personalized DM (editable)<textarea value={dm} onChange={e=>{setDm(e.target.value);setSaved(false);}} rows={5} maxLength={2000} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" /></label><label className="block text-xs font-medium">Specific profile evidence (40+ characters)<textarea value={evidence} onChange={e=>setEvidence(e.target.value)} rows={3} maxLength={2000} placeholder="Describe actual posts you reviewed, such as emergency food storage and power outage equipment." className="mt-1 w-full rounded-md border bg-background p-2 text-sm" /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={profileChecked} onChange={e=>setProfileChecked(e.target.checked)} /> I opened the correct TikTok profile, reviewed its content, and confirm this DM fits.</label><label className="block text-xs font-medium">Outreach owner <select value={assignee} onChange={e=>setAssignee(e.target.value as "Seth" | "Rena")} className="ml-2 rounded border bg-background p-2"><option value="Seth">Seth</option><option value="Rena">Rena</option></select></label><button type="button" disabled={busy || !dm.trim()} onClick={()=>void save()} className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">{busy?"Saving…":"Approve & Save DM"}</button>{saved&&<p role="status" className="text-sm font-semibold text-emerald-700">Approved for Outreach.</p>}</div>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}
