import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { reconcileProfileResearchStatus, getInfluencerMasterCounts, listWorkflowSection, listBatchOneResults, saveInfluencerDmDraft, setInfluencerWorkflowStatus } from "@/lib/influencer-master.functions";
import { CREATORS, hydrateCreatorsFromDB, useCreatorsVersion } from "@/lib/creator-partnerships";
import { importCreatorResearch } from "@/lib/creator-research-import.functions";


function parseResearchCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); records.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  if (cell || row.length) { row.push(cell); records.push(row); }
  const headers = (records.shift() || []).map(v => v.replace(/^\uFEFF/, "").trim());
  if (!headers.includes("tiktok_handle") && !headers.includes("match_tiktok_handle"))
    throw new Error("Missing TikTok handle column");
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate CSV column names");
  return records.filter(fields => fields.some(v => v.trim())).map((fields, index) => {
    if (fields.length !== headers.length) throw new Error("CSV row " + (index + 2) + " has incorrect column count");
    return Object.fromEntries(headers.map((name, i) => [name, fields[i]]));
  });
}

function influencerFacingDm(raw: string): string {
  const cleaned = raw.split(/\r?\n/).filter(line => !/^\s*(?:Outreach Status|Draft Status)\s*:/i.test(line)).join("\n").trim();
  if (!cleaned) return "";
  if (/\bno obligation\b|\bno requirement to (?:post|review)\b|\bnot required to (?:post|review)\b/i.test(cleaned)) return cleaned;
  return cleaned + "\n\nThere's no obligation to post or review anything.";
}

export const Route = createFileRoute("/")({
  component: InfluencerHome,
  head: () => ({ meta: [{ title: "Influencer Research — Survival Tabs" }, { name: "robots", content: "noindex" }] }),
});

function InfluencerHome() {
  const saveDraft = useServerFn(saveInfluencerDmDraft);
  const [secondLookIds] = useState<string[]>([]);
  const [rejectBusy, setRejectBusy] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string,string>>({});
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<Record<string,string>>({});
  const useCreatorsVersionValue = useCreatorsVersion();
  const loadCounts = useServerFn(getInfluencerMasterCounts);
  const loadBatch = useServerFn(listBatchOneResults);
  const fetchSection = useServerFn(listWorkflowSection);
  const reconcileResearch = useServerFn(reconcileProfileResearchStatus);
  const [reconcileBusy,setReconcileBusy] = useState(false);
  const [reconcileResult,setReconcileResult] = useState("");
  const setWorkflowStatus = useServerFn(setInfluencerWorkflowStatus);
  const workflowStatuses = ["research","ai_screened","approved","sent","second_look","rejected"] as const;
  const [workflowPage,setWorkflowPage] = useState(0);
  const [workflowRows,setWorkflowRows] = useState<Array<{source_table:string;source_id:string;display_name:string|null;tiktok_url:string|null;youtube_url:string|null;instagram_url:string|null;facebook_url:string|null;workflow_status:string}>>([]);
  const [workflowLoading,setWorkflowLoading] = useState(false);
  const [workflowError,setWorkflowError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [importPreview, setImportPreview] = useState("");
  const [researchRows, setResearchRows] = useState<Array<Record<string,string>>>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importReady, setImportReady] = useState(false);
  const runResearchImport = useServerFn(importCreatorResearch);

  useEffect(() => {
    if (expanded === null || expanded > 5) return;
    let active = true;
    setWorkflowLoading(true); setWorkflowError(""); setWorkflowRows([]);
    void fetchSection({data:{status:workflowStatuses[expanded],page:workflowPage}})
      .then(result => { if(active) setWorkflowRows(result.rows as Parameters<typeof setWorkflowRows>[0] & unknown[]); })
      .catch(error => { if(active) setWorkflowError(String(error)); })
      .finally(() => { if(active) setWorkflowLoading(false); });
    return () => {active=false;};
  },[expanded,workflowPage,fetchSection,useCreatorsVersionValue]);

  const [platform, setPlatform] = useState("All");
  const [contactFilter, setContactFilter] = useState("All");
  const [batch, setBatch] = useState<Array<{id:string;name:string;tiktok:string|null;youtube:string|null;instagram:string|null;facebook:string|null;email:string|null;contact_route:string|null;followers_signal:string|null;segment:string|null;target_audience:string|null;other_platform:string|null;personalized_dm:string|null;qualification_status:string|null;seth_approval_status:string|null;outreach_second_look_at:string|null;verification_evidence:string|null}>>([]);
  useEffect(() => { void loadBatch().then(setBatch).catch(console.error); }, [loadBatch]);
  const [masterCounts, setMasterCounts] = useState<{ total: number; boboQueueCount: number; sources: Record<string,number>; aiScreenedCount:number; aiRejectedCount:number; workflowCounts:Record<"research"|"ai_screened"|"approved"|"sent"|"second_look"|"rejected",number> } | null>(null);
  useEffect(() => { void loadCounts().then(setMasterCounts).catch(console.error); }, [loadCounts]);
  useEffect(() => { void hydrateCreatorsFromDB(); }, []);
  const categories = useMemo(() => {
    // Preserve every source record. Working-list deduplication uses verified social profile URLs,
    // not a TikTok-only key or a creator name (which could merge unrelated people).
    const unique = new Map<string, (typeof CREATORS)[number]>();
    const seenProfiles = new Map<string, string>();
    for (const c of CREATORS) {
      const profiles = (["tiktok", "youtube", "instagram", "facebook"] as const)
        .map(platform => {
          const value = c[platform]?.trim();
          if (!value) return "";
          try {
            const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
            return `${platform}:${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "").toLowerCase()}`;
          } catch { return ""; }
        }).filter(Boolean);
      const existingKey = profiles.map(p => seenProfiles.get(p)).find(Boolean);
      const key = existingKey || `record:${c.id}`;
      const prior = unique.get(key);
      // A manual decision always takes precedence when duplicate records exist.
      if (!prior || (!prior.sethApprovalStatus && c.sethApprovalStatus)) unique.set(key, c);
      for (const profile of profiles) seenProfiles.set(profile, key);
    }
    const rows = [...unique.values()];
    const rejected = (c: (typeof rows)[number]) => c.sethApprovalStatus === "rejected";
    const approved = (c: (typeof rows)[number]) => c.sethApprovalStatus === "approved";
    const secondLook = (c: (typeof rows)[number]) => Boolean(c.outreachSecondLookAt) && !rejected(c) && !approved(c);
    const moreResearch = (c: (typeof rows)[number]) => !rejected(c) && !approved(c) && !secondLook(c) && /needs more research/i.test(c.researchStatus || "");
    // Old AI qualification statuses are intentionally ignored until a fresh-screening stage is persisted.
    const forNow = rows.filter(c => !rejected(c) && !approved(c) && !secondLook(c) && !moreResearch(c));
    return [
      { name: "Keyword Search", count: masterCounts?.workflowCounts?.research ?? forNow.length, to: "/bobo-queue" },
      { name: "Profile Research", count: masterCounts?.workflowCounts?.ai_screened ?? 0, to: "/ai-screened" },
      { name: "Ready to Contact", count: masterCounts?.workflowCounts?.approved ?? 0, to: "/creators" },
      { name: "Sent", count: masterCounts?.workflowCounts?.sent ?? 0, to: "/creators" },
      { name: "Second Look", count: masterCounts?.workflowCounts?.second_look ?? 0, to: "/creators" },
      { name: "Rejected", count: masterCounts?.workflowCounts?.rejected ?? 0, to: "/creators" },
      { name: "Backup", count: CREATORS.length, to: "/influencer-original" },
    ] as const;
  }, [useCreatorsVersionValue, masterCounts, batch, secondLookIds]);
  const normalize = (value?: string | null) => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (/^(www\.)?(tiktok|instagram|youtube|facebook)\.com/i.test(value)) return "https://" + value;
    return null;
  };
  const fromCreator = (c: (typeof CREATORS)[number]) => ({
    id:c.id, name:c.name, note:c.sethApprovalNote || c.researchNotes || c.verificationEvidence,
    tiktok:c.tiktok, youtube:c.youtube, instagram:c.instagram, facebook:c.facebook,
    email:c.email, contact:c.contactRoute, followers:c.followersSignal, segment:c.segment, audience:c.targetAudience, geography:c.geography, source:c.primarySource, reach:c.reachSignal, confidence:c.contactConfidence, researched:c.lastResearched, status:c.researchStatus, priority:c.priority, evidence:c.verificationEvidence, offer:c.recommendedOffer, offerReason:c.offerReasoning, owner:c.outreachAssignee || c.outreachOwner, outreach:c.contactedDate, response:c.responseFollowup, next:c.sethNextAction, approval:c.sethApprovalStatus, platforms:c.primaryPlatforms, contactPage:c.otherPlatform, dm:c.personalizedDm
  });
  const fromBatch = (c: (typeof batch)[number]) => ({
    id:c.id, name:c.name, note:c.verification_evidence, tiktok:c.tiktok, youtube:c.youtube,
    instagram:c.instagram, facebook:c.facebook, email:c.email, contact:c.contact_route, followers:c.followers_signal, segment:c.segment || c.verification_evidence, audience:c.target_audience, geography:null, source:"BoBo Markdown Batch 1", reach:null, confidence:null, researched:"2026-10-10", status:c.qualification_status, priority:null, evidence:c.verification_evidence, offer:null, offerReason:null, owner:null, outreach:null, response:null, next:null, approval:c.seth_approval_status, platforms:"TikTok", contactPage:c.other_platform, dm:c.personalized_dm
  });
  // Every homepage section action changes ONLY workflow_status via the audited stage RPC,
  // then reloads the open section and counts from the database.
  const runStage = async (id: string, stage: "approved"|"second_look"|"rejected"|"ai_screened") => {
    if (rejectBusy !== null || expanded === null) return;
    setRejectBusy(id);
    try {
      const result = await setWorkflowStatus({data:{id,status:stage}});
      if (!result?.ok) throw new Error("Not saved");
      setWorkflowRows(prev => prev.filter(row => row.source_id !== id));
      const [fresh, counts] = await Promise.all([fetchSection({data:{status:workflowStatuses[expanded],page:workflowPage}}), loadCounts()]);
      setWorkflowRows(fresh.rows as Parameters<typeof setWorkflowRows>[0] & unknown[]);
      setMasterCounts(counts);
    } catch (err) { window.alert("Could not update: " + (err instanceof Error ? err.message : String(err))); }
    finally { setRejectBusy(null); }
  };
  const toneClass = { green: "border-green-300 text-green-800 hover:bg-green-50", amber: "border-amber-300 text-amber-800 hover:bg-amber-50", red: "border-red-300 text-red-700 hover:bg-red-50", neutral: "hover:bg-muted" } as const;
  const StageButton = ({label,tone,stage,id,confirmText}:{label:string;tone:keyof typeof toneClass;stage:"approved"|"second_look"|"rejected"|"ai_screened";id:string;confirmText?:string}) =>
    <button type="button" disabled={rejectBusy !== null} onClick={e => { e.preventDefault(); e.stopPropagation(); if (confirmText && !window.confirm(confirmText)) return; void runStage(id, stage); }} className={"rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-50 " + toneClass[tone]}>{rejectBusy === id ? "Saving…" : label}</button>;
  const groups = categories.map(category => ({ ...category, rows: [] as ReturnType<typeof fromCreator>[], visibleCount: 0 }));
  return <main className="mx-auto max-w-3xl space-y-3 p-4 sm:p-8">
    <h1 className="mb-4 text-2xl font-bold">Influencers</h1>
    {masterCounts?.workflowCounts && <div className="rounded-xl border bg-card p-4" aria-label="Workflow progress">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">Workflow progress</span>
        <span className="tabular-nums font-semibold">{(masterCounts.workflowCounts.sent + masterCounts.workflowCounts.second_look + masterCounts.workflowCounts.rejected).toLocaleString()} / {masterCounts.total.toLocaleString()}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{width: `${masterCounts.total ? 100*(masterCounts.workflowCounts.sent + masterCounts.workflowCounts.second_look + masterCounts.workflowCounts.rejected)/masterCounts.total : 0}%`}} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Sections 1–3 are work in progress. Sections 4–6 are sent, second look, and rejected. Second Look may be reviewed again. Nothing moves automatically without a recorded review or outreach action.</p>
    </div>}
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">Platform
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="min-h-11 w-full rounded-lg border bg-background px-2">
          {["All","TikTok","YouTube","Instagram","Facebook"].map(p => <option key={p} value={p}>{p === "All" ? "All platforms" : p}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">Contact
        <select value={contactFilter} onChange={e => setContactFilter(e.target.value)} className="min-h-11 w-full rounded-lg border bg-background px-2">
          {["All","Email","Contact page","DM"].map(v => <option key={v} value={v}>{v === "All" ? "All contacts" : v}</option>)}
        </select>
      </label>
    </div>
    {groups.filter((_,i) => i < 6).map((c, i) => <section key={c.name} className="overflow-hidden rounded-xl border bg-card">
      <button type="button" aria-expanded={expanded === i} onClick={() => {setWorkflowPage(0);setExpanded(expanded === i ? null : i);}}
        className="flex min-h-20 w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/50">
        <span className="font-semibold">{i + 1}. {c.name}</span>
        <span className="flex items-center gap-4">
          <span className="tabular-nums text-muted-foreground">{c.count.toLocaleString()}</span>
          <ChevronDown className={`h-5 w-5 transition-transform ${expanded === i ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded === i && <div className="border-t px-4 py-3">
        {i === 0 && <p className="mb-3 text-sm text-muted-foreground">BoBo's collected TikTok handles and research queue. The count reflects creators awaiting screening, not the number of keywords.</p>}

        {i === 1 && <p className="mb-3 text-sm text-muted-foreground">Profiles with completed research, awaiting your manual review. Each creator belongs to one section only.</p>}
        {i === 1 && <div className="mb-3">
          <button type="button" disabled={reconcileBusy} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50" onClick={async()=>{
            if(!window.confirm("Move researched profiles from Keyword Search to Profile Research? Existing manual decisions will not be changed."))return;
            setReconcileBusy(true);setReconcileResult("");
            try{
              const result=await reconcileResearch();
              setReconcileResult(result.moved+" researched profiles moved to Section 2.");
              setWorkflowPage(0);
              const [fresh,counts]=await Promise.all([fetchSection({data:{status:"ai_screened",page:0}}),loadCounts()]);
              setWorkflowRows(fresh.rows as Parameters<typeof setWorkflowRows>[0] & unknown[]);
              setMasterCounts(counts);
            }catch(error){setReconcileResult("Reconciliation failed: "+String(error));}
            finally{setReconcileBusy(false);}
          }}>{reconcileBusy?"Updating…":"Sync researched profiles into Section 2"}</button>
          {reconcileResult&&<p role="status" className="mt-2 text-sm">{reconcileResult}</p>}
        </div>}
        {i === 2 && <p className="mb-3 text-sm text-muted-foreground">Manually approved creators ready for personalized outreach.</p>}
        {i === 0 && <Link to={c.to} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">Open full list <ExternalLink className="h-4 w-4" /></Link>}
        {<>
          {workflowLoading && <p className="text-sm">Loading…</p>}
          {workflowError && <p role="alert" className="text-sm text-red-700">{workflowError}</p>}
          {!workflowLoading && workflowRows.length === 0 && <p className="text-sm text-muted-foreground">No profiles in this section.</p>}
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {workflowRows.filter(w => (platform === "All" || Boolean(w[ (platform.toLowerCase()+"_url") as "tiktok_url"|"youtube_url"|"instagram_url"|"facebook_url" ]))).map(w => {
              const source = CREATORS.find(c => c.id === w.source_id);
              const imported = batch.find(c => c.id === w.source_id);
              const person = source ? fromCreator(source) : imported ? fromBatch(imported) : {
                id:w.source_id,name:w.display_name || w.source_id,note:null,tiktok:w.tiktok_url,youtube:w.youtube_url,instagram:w.instagram_url,facebook:w.facebook_url,
                email:null,contact:null,followers:null,segment:null,audience:null,geography:null,source:w.source_table,reach:null,confidence:null,
                researched:null,status:w.workflow_status,priority:null,evidence:null,offer:null,offerReason:null,owner:null,outreach:null,response:null,next:null,approval:null,platforms:null,contactPage:null,dm:null
              };
              return <details key={w.source_table+":"+person.id} className="rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
              <summary className="group flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 rounded-lg py-1 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                <span className="min-w-0 flex-1 truncate font-semibold">{person.name || person.id}</span>
                {person.followers && <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium tabular-nums">{person.followers} followers</span>}
                {normalize(person.tiktok || person.youtube || person.instagram || person.facebook) && <a href={normalize(person.tiktok || person.youtube || person.instagram || person.facebook)!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted" title="Open social profile">Profile <ExternalLink className="h-3 w-3" /></a>}
                {person.email && <a href={`mailto:${person.email}`} onClick={e => e.stopPropagation()} className="rounded-md border px-2 py-1 text-xs font-semibold hover:bg-muted" title={person.email}>E</a>}
                {w.source_table === "creators" && (i === 1 || i === 4) && <StageButton label="Approve" tone="green" stage="approved" id={person.id} />}
                {w.source_table === "creators" && (i === 1 || i === 2) && <StageButton label="Second Look" tone="amber" stage="second_look" id={person.id} />}
                {w.source_table === "creators" && (i === 1 || i === 2 || i === 4) && <StageButton label="Reject" tone="red" stage="rejected" id={person.id} confirmText={i === 2 ? `Reject approved creator ${person.name}?` : undefined} />}
                {w.source_table === "creators" && (i === 4 || i === 5) && <StageButton label="Restore to Section 2" tone="neutral" stage="ai_screened" id={person.id} />}
                {i !== 1 && person.dm && <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard.writeText(influencerFacingDm(draftEdits[person.id] ?? person.dm!)); setDraftNotice(prev => ({...prev,[person.id]:"DM copied"})); }} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-foreground hover:bg-primary/20" title="Copy personalized DM without opening details">Copy DM</button>}
              </summary>
              <div className="space-y-2 pt-2 text-sm">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {person.segment && <p><strong>Focus:</strong> {person.segment}</p>}
                  {person.geography && <p><strong>Location:</strong> {person.geography}</p>}
                  {person.approval && <p><strong>Decision:</strong> {person.approval}</p>}
                </div>
                {person.evidence && <p><strong>Evidence:</strong> {person.evidence}</p>}
                {person.email && <p className="text-sm"><strong>Email:</strong> <a className="underline" href={`mailto:${person.email}`}>{person.email}</a></p>}
                {normalize(person.contactPage) && <a className="inline-flex items-center gap-1 underline" href={normalize(person.contactPage)!} target="_blank" rel="noopener noreferrer">Contact page <ExternalLink className="h-4 w-4" /></a>}
                {i !== 1 && person.dm && <div className="rounded-lg border bg-muted/30 p-3">
                  <label htmlFor={`dm-${person.id}`} className="block font-semibold">Rena's personalized DM draft</label>
                  <textarea id={`dm-${person.id}`} rows={5} className="mt-2 w-full resize-y rounded-lg border bg-background p-3 text-sm" value={draftEdits[person.id] ?? influencerFacingDm(person.dm ?? "")} onChange={e => setDraftEdits(prev => ({...prev,[person.id]:e.target.value}))} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={draftBusy === person.id || !(draftEdits[person.id] ?? person.dm).trim()} className="rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50" onClick={async () => {
                      setDraftBusy(person.id); setDraftNotice(prev => ({...prev,[person.id]:""}));
                      try {
                        const saved = await saveDraft({data:{id:person.id,dm:influencerFacingDm(draftEdits[person.id] ?? person.dm!)}});
                        setBatch(prev => prev.map(c => c.id === person.id ? {...c,personalized_dm:saved.personalized_dm} : c));
                        setDraftNotice(prev => ({...prev,[person.id]:"Saved to CRM"}));
                      } catch (e) {setDraftNotice(prev => ({...prev,[person.id]:"Save failed: "+String(e)}));}
                      finally {setDraftBusy(null);}
                    }}>{draftBusy === person.id ? "Saving…" : "Save DM"}</button>
                    <button type="button" className="rounded-lg border px-3 py-2" onClick={() => void navigator.clipboard.writeText(influencerFacingDm(draftEdits[person.id] ?? person.dm!))}>Copy DM</button>
                  </div>
                  {draftNotice[person.id] && <p role="status" className="mt-2 text-xs">{draftNotice[person.id]}</p>}
                </div>}
                {person.note && person.note !== person.evidence && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{person.note}</p>}
                <div className="flex flex-wrap gap-3">{(["tiktok","youtube","instagram","facebook"] as const).map(p => {
                  const url = normalize(person[p]);
                  return url ? <a key={p} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">{p[0].toUpperCase()+p.slice(1)} <ExternalLink className="h-4 w-4" /></a> : null;
                })}</div>
                <p className="text-xs text-muted-foreground">Existing manual decisions are preserved. Approval changes are not made from this view.</p>
              </div>
            </details>;
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" disabled={workflowPage === 0 || workflowLoading} className="rounded-md border px-3 py-2 disabled:opacity-40" onClick={() => setWorkflowPage(p=>Math.max(0,p-1))}>Previous</button>
            <span className="text-sm text-muted-foreground">Page {workflowPage+1}</span>
            <button type="button" disabled={workflowRows.length < 100 || workflowLoading} className="rounded-md border px-3 py-2 disabled:opacity-40" onClick={() => setWorkflowPage(p=>p+1)}>Next 100</button>
          </div>
        </>}
      </div>}
    </section>)}
    <section className="rounded-xl border bg-card p-5" aria-labelledby="import-research-heading">
      <h2 id="import-research-heading" className="text-lg font-semibold">Import Research</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Stage 2 — Select BoBo's extracted creator CSV to check the file before importing.
        This preview does not change creator records, approvals, or outreach history.
      </p>
      <button type="button" className="mt-3 ml-2 inline-flex min-h-11 items-center rounded-lg border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-muted" onClick={async () => {
        const instructions = "$continue dev — Survival Tabs influencer ZIP screening and CRM import. Read AGENTS.md, INFLUENCER_EXTRACTION_RULES.md, the original BoBo 500-keyword list, and live CRM schema/importer. Use the keyword list as niche references, not automatic qualification. CORE FIT: civilian emergency preparedness, emergency food storage, camping, hiking, backpacking, remote outdoor adventures, wilderness skills, homesteading, preserving food, off-grid living and family emergency planning. CONDITIONAL FIT: outdoor fishing trips, remote RV or van camping, trail nutrition, expedition fitness, and reviewers of camping or emergency gear, only when the account's bio or recurring posts show that specific connection. EXCLUDE as standalone niches: general cooking, recipes, fitness coaching, general product reviews, Amazon finds, everyday home gadgets, fashion, lifestyle, city tourism and ordinary vacations. Travel must involve outdoor adventure; product reviews must involve outdoor, emergency or self-reliance equipment. Screen each full bio and all available captions; a clearly relevant bio can pass without captions. Use contextual evidence rather than isolated keywords. Classify each creator A Passed Initial Screening when available evidence establishes a relevant niche, or C Reject when it does not, with specific evidence. Do not use Needs Research for ambiguous niches, missing captions, unknown US location or absent email. Use Incomplete Capture ONLY when the Markdown is objectively defective (truncated, wrong account, or extraction failure that omitted available profile information); document the technical defect and return it to BoBo for recapture, outside Seth's active review queue. If capture is technically valid but niche evidence is insufficient, Reject. Unknown US location, absent email or absent captions do not themselves disqualify; only credible evidence of a non-US base does. Separate individual creators from commercial brands. Audit every rejection for missed outdoor/preparedness relevance and every pass for overly broad fit. Write a unique evidence-grounded sample-offer DM for every A, with no posting obligation, signed Rena, Survival Tabs. Never send. Enrich only verifiable links and contacts. Do all screening and DM writing in ChatGPT without Lovable credits. Preserve manual decisions, edited drafts, raw Markdown, captions and history. Produce one CSV using actual importer-supported fields including tiktok_handle, ai_recommendation, ai_reasoning, ai_evidence, research_sources and personalized_dm, never tiktok_url. Existing importer only fills empty fields; report recommendation conflicts and never overwrite manual decisions. Keep A in Section 2 until Seth manually approves Section 3. Verify actual CRM writes and report counts, skipped records and pending corrections. Never claim completion without verification. FULL-SCHEMA CSV FORMAT: The live creators table has 144 columns; do NOT restrict extraction to six. First inspect the current live creators schema and importer and map every verifiable field from the source Markdown into its exact supported column name, including profile bio, follower metrics, social links, contact details, captions, recent posts, original raw_markdown, capture provenance, screening decision, reasoning, evidence, sources and DM draft. Include only columns with sourced values; not all 144 columns need to be present or filled. Required key: tiktok_handle. Include ai_recommendation, ai_reasoning, ai_evidence, research_sources and personalized_dm where applicable. Never use tiktok_url as a CSV column. Never populate workflow_status, manual approvals, outreach state, timestamps, or other importer-protected fields directly; the importer derives status from A/C and protects manual decisions. Do not invent missing information or overwrite nonempty existing values. All JSON/JSONB columns must contain valid JSON encoded as CSV cells; use JSON.stringify and CSV-escape embedded quotes and commas. Validate each JSON cell with JSON.parse, numeric and boolean fields against schema, every header against the live importer, unique normalized handles, and CSV row integrity. Preflight the entire batch against the live database, then confirm import and verify inserted/enriched/unchanged counts, section placement, and saved raw captures. Audit the previous 203 creators for missing full source captures and enrich only from their original Markdown, without re-screening or overwriting manual decisions.";
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
          await navigator.clipboard.writeText(instructions);
          window.alert("Full-schema processing instructions copied. Validate all JSON fields and live database columns before import.");
        } catch {
          // Clipboard permissions can be denied in embedded browsers or insecure contexts.
          // Display the full text so it can always be selected and copied manually.
          window.prompt("Select all and copy processing instructions:", instructions);
        }
      }}>Copy Processing Instructions</button>
      <label htmlFor="creator-research-csv" className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">
        Import Research CSV
      </label>
      <input
        id="creator-research-csv"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={async event => {
          const file = event.currentTarget.files?.[0];
          setImportReady(false); setResearchRows([]);
          if (!file) return;
          setImportBusy(true);
          setImportPreview("Checking " + file.name + "…");
          try {
            if (file.size > 15 * 1024 * 1024) throw new Error("File exceeds 15 MB");
            const rows = parseResearchCsv(await file.text());
            if (!rows.length || rows.length > 500) throw new Error("Select 1–500 creators per CSV");
            const handles = rows.map(row => (row.tiktok_handle || row.match_tiktok_handle || "").trim().toLowerCase().replace(/^@/, ""));
            const valid = handles.every(handle => /^[a-z0-9._]{2,30}$/.test(handle));
            const unique = new Set(handles);
            if (!valid) throw new Error("Some rows have missing or invalid TikTok handles");
            if (unique.size !== handles.length) throw new Error("Duplicate TikTok handles in the CSV");
            const result = await runResearchImport({ data: { rows, confirm: false } });
            if (!result || typeof result.total !== "number" || typeof result.failed !== "number") {
              throw new Error("Database preflight did not return a valid response. Import remains disabled.");
            }
            setResearchRows(rows);
            setImportReady(result.failed === 0);
            setImportPreview("Database preflight passed: " + result.total + " creators, " +
              Object.keys(rows[0]).length + " CSV columns, " + result.new + " new, " +
              result.existing + " existing, " + result.failed + " invalid. " +
              (result.errors.length ? result.errors.join("; ") : "No database records changed."));

          } catch (error) {
            setImportPreview("Cannot import: " + String(error));
          } finally { setImportBusy(false); event.currentTarget.value = ""; }
        }}
      />
      {importPreview && <p role="status" className="mt-3 whitespace-pre-wrap text-sm">{importPreview}</p>}
      {importReady && <button type="button" disabled={importBusy} className="mt-3 ml-2 rounded-lg border border-primary px-4 py-3 font-semibold disabled:opacity-50" onClick={async () => {
        if (!window.confirm("Import " + researchRows.length + " research profiles? This adds new creators and fills empty research fields; manual decisions are preserved.")) return;
        setImportBusy(true); setImportReady(false);
        try {
          const result = await runResearchImport({ data: { rows: researchRows, confirm: true } });
          if (!result || typeof result.inserted !== "number") throw new Error("Import service returned no confirmation. Check database before retrying.");
          setImportPreview("Import complete: " + result.inserted + " inserted, " + result.updated + " enriched, " + result.skipped + " unchanged, " + result.failed + " failed." +
            (result.errors.length ? "\\n" + result.errors.join("\\n") : ""));
          void loadCounts().then(setMasterCounts);
          void hydrateCreatorsFromDB();
        } catch (error) { setImportPreview("Import failed: " + String(error)); }
        finally { setImportBusy(false); }
      }}>{importBusy ? "Importing…" : "Confirm Import to CRM"}</button>}
      <p className="mt-2 text-xs text-muted-foreground">
        CSV upload supports up to 500 creators per batch. Preview first, then confirm. Existing nonempty fields and manual decisions are preserved. ZIP and raw Markdown uploads are not yet supported.
      </p>
    </section>
  </main>;
}
