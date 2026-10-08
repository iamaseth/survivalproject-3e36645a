import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CREATORS, refreshCreatorsFromDB, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { amICreatorApprover, sethReviewCreator, sethSaveDmDraft } from "@/lib/creators.functions";
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
  const [evidence,setEvidence] = useState("");
  const [error,setError] = useState("");
  const [saved,setSaved] = useState(false);
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
    busyRef.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      await saveDraft({data:{id:c.id,dm:dm.trim(),note:"ChatGPT profile evidence (not independently verified by CRM): "+evidence.slice(0,500)}});
      setSaved(true);
      toast.success("Personalized DM saved to CRM");
    } catch(e) { setError(e instanceof Error ? e.message : "DM was not saved"); }
    finally {busyRef.current = false; setBusy(false); }
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
      <button type="button" onClick={() => void paste()} className={`rounded-md border px-3 py-1.5 text-xs ${saved ? "border-emerald-700 bg-emerald-700 text-white" : "hover:bg-secondary"}`}>{saved ? "Saved ✓" : "Paste"}</button>
      <button type="button" disabled={busy} onClick={() => void act("rejected")} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">Reject</button>
    </div>
    {showPaste && <div className="mt-3 space-y-2"><label className="block text-xs font-medium">Complete ChatGPT result (Ctrl+V if automatic paste is blocked)<textarea value={rawInput} onChange={e=>setRawInput(e.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" /></label><button type="button" onClick={()=>parseResult(rawInput)} className="rounded-md border px-3 py-2 text-xs">Load result</button><label className="block text-xs font-medium">Personalized DM (editable)<textarea value={dm} onChange={e=>{setDm(e.target.value);setSaved(false);}} rows={5} maxLength={2000} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" /></label><button type="button" disabled={busy || !dm.trim()} onClick={()=>void save()} className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">{busy?"Saving…":"Save DM"}</button>{saved&&<p role="status" className="text-sm font-semibold text-emerald-700">Saved successfully to CRM. Outreach approval remains separate until profile verification.</p>}</div>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}
