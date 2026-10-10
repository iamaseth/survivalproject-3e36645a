import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { manualQualificationOverride, secondLookAction } from "@/lib/creators.functions";
import { getInfluencerMasterCounts, listWorkflowSection, listBatchOneResults, moveAiScreenedToSecondLook, saveInfluencerDmDraft } from "@/lib/influencer-master.functions";
import { CREATORS, hydrateCreatorsFromDB, useCreatorsVersion } from "@/lib/creator-partnerships";

export const Route = createFileRoute("/")({
  component: InfluencerHome,
  head: () => ({ meta: [{ title: "Influencer Research — Survival Tabs" }, { name: "robots", content: "noindex" }] }),
});

function InfluencerHome() {
  const saveDraft = useServerFn(saveInfluencerDmDraft);
  const rejectCreator = useServerFn(manualQualificationOverride);
  const approveCreator = useServerFn(manualQualificationOverride);
  const approvedSecondLook = useServerFn(secondLookAction);
  const secondLookCreator = useServerFn(moveAiScreenedToSecondLook);
  const [secondLookIds, setSecondLookIds] = useState<string[]>([]);
  const [rejectBusy, setRejectBusy] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string,string>>({});
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<Record<string,string>>({});
  const useCreatorsVersionValue = useCreatorsVersion();
  const loadCounts = useServerFn(getInfluencerMasterCounts);
  const loadBatch = useServerFn(listBatchOneResults);
  const fetchSection = useServerFn(listWorkflowSection);
  const [workflowPage, setWorkflowPage] = useState(0);
  const [workflowRows, setWorkflowRows] = useState<Array<{source_table:string;source_id:string;display_name:string|null;tiktok_url:string|null;youtube_url:string|null;instagram_url:string|null;facebook_url:string|null;workflow_status:string}>>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const workflowStatuses = ["research","ai_screened","approved","sent","second_look","rejected"] as const;
  const [expanded, setExpanded] = useState<number | null>(null);
  useEffect(() => {
    if (expanded === null || expanded > 5) return;
    let active = true;
    setWorkflowLoading(true); setWorkflowError("");
    void fetchSection({data:{status:workflowStatuses[expanded],page:workflowPage}})
      .then(result => { if(active) setWorkflowRows(result.rows); })
      .catch(error => { if(active) setWorkflowError(String(error)); })
      .finally(() => { if(active) setWorkflowLoading(false); });
    return () => { active = false; };
  }, [expanded, workflowPage, fetchSection]);

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
      { name: "For Now", count: masterCounts?.workflowCounts?.research ?? forNow.length, to: "/bobo-queue" },
      { name: "AI Screened", count: masterCounts?.workflowCounts?.ai_screened ?? 0, to: "/ai-screened" },
      { name: "Manually Approved", count: masterCounts?.workflowCounts?.approved ?? 0, to: "/creators" },
      { name: "Sent", count: masterCounts?.workflowCounts?.sent ?? 0, to: "/creators" },
      { name: "Second Look", count: masterCounts?.workflowCounts?.second_look ?? 0, to: "/creators" },
      { name: "Rejected", count: masterCounts?.workflowCounts?.rejected ?? 0, to: "/creators" },
      { name: "Original List", count: CREATORS.length, to: "/influencer-original" },
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
  const groups = categories.map((category, i) => {
    const rows = i === 0 ? CREATORS.filter(c => !c.sethApprovalStatus && !c.outreachSecondLookAt && !/needs more research/i.test(c.researchStatus || "")).map(fromCreator) : i === 6 ? CREATORS.map(fromCreator) : i === 1
      ? batch.filter(c => ["Qualified", "Needs Review"].includes(c.qualification_status || "") && !c.seth_approval_status && !c.outreach_second_look_at && !secondLookIds.includes(c.id)).map(fromBatch)
      : i === 4
      ? [...CREATORS.filter(c => c.sethApprovalStatus === "rejected").map(fromCreator), ...batch.filter(c => c.qualification_status === "Not Relevant" && !c.seth_approval_status).map(fromBatch)]
      : i >= 2 && i <= 5
      ? (i === 3 ? CREATORS.filter(c => Boolean(c.outreachSecondLookAt)).map(fromCreator).concat(batch.filter(c => Boolean(c.outreach_second_look_at)).map(fromBatch)) : i === 2 ? CREATORS.filter(c => c.sethApprovalStatus === "approved" && !c.outreachSecondLookAt).map(fromCreator).concat(batch.filter(c => c.seth_approval_status === "approved" && !c.outreach_second_look_at && !secondLookIds.includes(c.id)).map(fromBatch)) : CREATORS.filter(c => !c.sethApprovalStatus && /needs more research/i.test(c.researchStatus || "")).map(fromCreator))
      : [];
    const uniqueRows = (i === 2 || i === 3) ? [...new Map(rows.map(c => { const profile = normalize(c.tiktok || c.youtube || c.instagram || c.facebook); const key = profile ? profile.toLowerCase().replace(/\\/$/, "") : c.id; return [key,c] as const; }).reverse()).values()].reverse() : rows;
    const filtered = uniqueRows.filter(c => (platform === "All" || Boolean(normalize(c[platform.toLowerCase() as "tiktok" | "youtube" | "instagram" | "facebook"]))) && (contactFilter === "All" || (contactFilter === "Email" ? Boolean(c.email) : contactFilter === "Contact page" ? Boolean(normalize(c.contactPage)) : Boolean(c.contact || c.tiktok || c.instagram))));
    return { ...category, rows:filtered, visibleCount:filtered.length };
  });
  return <main className="mx-auto max-w-3xl space-y-3 p-4 sm:p-8">
    <h1 className="mb-4 text-2xl font-bold">Influencers</h1>
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
    {groups.map((c, i) => <section key={c.name} className="overflow-hidden rounded-xl border bg-card">
      <button type="button" aria-expanded={expanded === i} onClick={() => { setWorkflowPage(0); setExpanded(expanded === i ? null : i); }}
        className="flex min-h-20 w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/50">
        <span className="font-semibold">{i + 1}. {i === 2 ? "Already Manually Approved" : c.name}</span>
        <span className="flex items-center gap-4">
          <span className="tabular-nums text-muted-foreground">{(platform === "All" && contactFilter === "All" ? (i === 6 && masterCounts ? masterCounts.total : c.count) : c.visibleCount).toLocaleString()}</span>
          <ChevronDown className={`h-5 w-5 transition-transform ${expanded === i ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded === i && <div className="border-t px-4 py-3">
        {i === 0 && <Link to="/bobo-queue" className="mb-3 inline-flex rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">Open BoBo research queue</Link>}
        {i === 6 ? <Link to="/influencer-original" className="underline">Browse original source records</Link> : <>
          {workflowLoading && <p className="text-sm text-muted-foreground">Loading profiles…</p>}
          {workflowError && <p role="alert" className="text-sm text-destructive">{workflowError}</p>}
          {!workflowLoading && !workflowError && workflowRows.length === 0 && <p className="text-sm text-muted-foreground">No profiles in this section.</p>}
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {workflowRows.map(person => {
              const profile = normalize(person.tiktok_url || person.youtube_url || person.instagram_url || person.facebook_url);
              return <div key={person.source_table + ":" + person.source_id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium">{person.display_name || person.source_id}</span>
                {profile && <a href={profile} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border px-3 py-2 text-sm">Profile <ExternalLink className="inline h-3 w-3" /></a>}
              </div>;
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" className="rounded-md border px-3 py-2 text-sm disabled:opacity-40" disabled={workflowPage===0 || workflowLoading} onClick={() => setWorkflowPage(p=>Math.max(0,p-1))}>Previous</button>
            <span className="text-sm text-muted-foreground">Page {workflowPage+1}</span>
            <button type="button" className="rounded-md border px-3 py-2 text-sm disabled:opacity-40" disabled={workflowLoading || workflowRows.length<100} onClick={() => setWorkflowPage(p=>p+1)}>Next 100</button>
          </div>
        </>}
      </div>}
    </section>)}
  </main>;
}
