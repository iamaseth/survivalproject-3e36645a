import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CREATORS, useCreatorsVersion, refreshCreatorsFromDB, type CreatorRow } from "@/lib/creator-partnerships";
import { amICreatorApprover, sethReviewCreator } from "@/lib/creators.functions";
import { hasGroundedDm, isFinalApprovalReady, isPendingResearchCandidate } from "@/lib/final-approval";
import { externalLinkProps } from "@/lib/external-link";

export function SethReviewPanel() {
  const check = useServerFn(amICreatorApprover);
  const version = useCreatorsVersion();
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { check().then((r) => setAllowed(r.approver)).catch(() => setAllowed(false)); }, []);
  useEffect(() => { if (allowed) refreshCreatorsFromDB().catch(() => setError("Could not load creators. Reload to retry.")).finally(() => setLoaded(true)); }, [allowed]);
  const rows = useMemo(() => CREATORS.filter(isFinalApprovalReady).sort((a, b) => a.name.localeCompare(b.name)), [version, revision]);
  const researchCount = useMemo(() => CREATORS.filter((c) => isPendingResearchCandidate(c) && !isFinalApprovalReady(c)).length, [version, revision]);
  if (!allowed) return null;
  return <section id="final-approval" className="overflow-hidden rounded-xl border border-border bg-card">
    <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left hover:bg-secondary/40">
      {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1 whitespace-normal"><div className="font-semibold">Needs Final Approval <span className="ml-1 text-sm font-normal text-muted-foreground">({loaded && !error ? rows.length : "—"})</span></div></div>
      <span className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium">{open ? "Close" : "Open"}</span>
    </Button>
    {open ? <div className="border-t border-border">
      {error ? <p role="alert" className="px-4 py-5 text-sm text-destructive">{error}</p> : !loaded ? <p className="px-4 py-5 text-sm text-muted-foreground">Loading…</p> : rows.length ? rows.map((c, i) => <FinalApprovalRow key={c.id} c={c} open={activeId === c.id} toggle={() => setActiveId(activeId === c.id ? null : c.id)} onDone={() => { setActiveId(rows[i + 1]?.id ?? null); setRevision((n) => n + 1); }} />) : <p className="px-4 py-5 text-sm text-muted-foreground">Awaiting direct profile research and personalized DMs.</p>}
      {loaded && !error ? <div className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground"><Link to="/tiktok-dm-review" className="underline">Needs research ({researchCount})</Link><Link to="/seth-approval" search={{ history: true }} className="underline">Decision history / Undo</Link></div> : null}
    </div> : null}
  </section>;
}

function FinalApprovalRow({ c, open, toggle, onDone }: { c: CreatorRow; open: boolean; toggle: () => void; onDone: () => void }) {
  const review = useServerFn(sethReviewCreator);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dm, setDm] = useState(c.personalizedDm || "");
  const [error, setError] = useState("");
  const handle = c.tiktok?.match(/@([^/?#]+)/)?.[1] ?? c.name;
  const evidence = c.verificationEvidence || "";
  const act = async (decision: "approved" | "rejected") => {
    if (inFlight.current || !isFinalApprovalReady(c)) return;
    if (decision === "approved" && !hasGroundedDm(evidence, dm)) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      await review({ data: { id: c.id, decision, dm: decision === "approved" ? dm : undefined, note: decision === "approved" ? "Final approval after direct researcher verification and creator-specific DM review" : "Not Relevant — rejected at final approval", checkedProfile: decision === "approved", messageFits: decision === "approved" } });
      if (decision === "approved") c.personalizedDm = dm.trim();
      c.sethApprovalStatus = decision;
      toast.success(decision === "approved" ? "Approved for shared outreach" : "Rejected");
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Try again."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <div className="border-b border-border last:border-0">
    <div className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(150px,1fr)_90px_minmax(200px,2fr)_auto_34px]">
      <div className="min-w-0 break-all font-medium">@{handle}</div>
      <a {...externalLinkProps(c.tiktok)} className="text-sm text-primary underline">TikTok ↗</a>
      <p className="line-clamp-2 text-xs text-muted-foreground" title={evidence}>{evidence}</p>
      <div className="flex gap-2"><Button size="sm" disabled={busy || !hasGroundedDm(evidence, dm)} onClick={() => void act("approved")}>Approve</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void act("rejected")}>Reject</Button></div>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Details for @${handle}`} aria-expanded={open}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>
    </div>
    {open ? <div className="grid gap-4 border-t border-border bg-secondary/20 px-4 py-4 lg:grid-cols-2"><div className="space-y-2 text-sm"><p className="whitespace-pre-wrap">{evidence}</p><p className="text-xs text-muted-foreground">{c.fullVerification} · {c.verificationDate}</p></div><label className="text-xs font-medium">Saved DM<textarea aria-label={`Saved DM for @${handle}`} value={dm} disabled={busy} onChange={(e) => setDm(e.target.value)} rows={5} maxLength={2000} className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" /></label></div> : null}
    {error ? <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p> : null}
  </div>;
}
