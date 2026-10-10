import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { manualQualificationOverride, secondLookAction } from "@/lib/creators.functions";
import { getInfluencerMasterCounts, listBatchOneResults, moveAiScreenedToSecondLook, saveInfluencerDmDraft } from "@/lib/influencer-master.functions";
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
  const [expanded, setExpanded] = useState<number | null>(null);
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
      <button type="button" aria-expanded={expanded === i} onClick={() => setExpanded(expanded === i ? null : i)}
        className="flex min-h-20 w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/50">
        <span className="font-semibold">{i + 1}. {i === 2 ? "Already Manually Approved" : c.name}</span>
        <span className="flex items-center gap-4">
          <span className="tabular-nums text-muted-foreground">{(platform === "All" && contactFilter === "All" ? (i === 6 && masterCounts ? masterCounts.total : i === 0 && masterCounts ? masterCounts.boboQueueCount : c.count) : c.visibleCount).toLocaleString()}</span>
          <ChevronDown className={`h-5 w-5 transition-transform ${expanded === i ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded === i && <div className="border-t px-4 py-3">
        {i === 0 && <p className="mb-3 text-sm text-muted-foreground">BoBo's full research queue, progress counter, and next-profile button.</p>}
        {i === 6 && <p className="mb-3 text-sm text-muted-foreground">Browse the complete original source records.</p>}
        {(i === 0 || i === 6) && <Link to={c.to} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">Open full list <ExternalLink className="h-4 w-4" /></Link>}
        {<>
          {c.rows.length === 0 && <p className="text-sm text-muted-foreground">No profiles in this section.</p>}
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {c.rows.map(person => <details key={person.id} className="rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
              <summary className="group flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 rounded-lg py-1 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                <span className="min-w-0 flex-1 truncate font-semibold">{person.name || person.id}</span>
                {person.followers && <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium tabular-nums">{person.followers} followers</span>}
                {normalize(person.tiktok || person.youtube || person.instagram || person.facebook) && <a href={normalize(person.tiktok || person.youtube || person.instagram || person.facebook)!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted" title="Open social profile">Profile <ExternalLink className="h-3 w-3" /></a>}
                {person.email && <a href={`mailto:${person.email}`} onClick={e => e.stopPropagation()} className="rounded-md border px-2 py-1 text-xs font-semibold hover:bg-muted" title={person.email}>E</a>}
                {i === 1 && <button type="button" disabled={rejectBusy !== null} onClick={async e => { e.preventDefault(); e.stopPropagation(); if (rejectBusy !== null) return; if (!window.confirm(`Approve ${person.name} and assign to Rena?`)) return; setRejectBusy(person.id); try { const result = await approveCreator({data:{id:person.id,decision:"approved",checkedProfile:true,assignee:"Rena",evidence:"Manual approval from AI Screened"}}); if (!result?.ok) throw new Error("Approval not confirmed"); setBatch(prev => prev.map(c => c.id === person.id ? {...c,seth_approval_status:"approved"} : c)); await hydrateCreatorsFromDB(); } catch(err) { window.alert("Could not approve: "+String(err)); } finally { setRejectBusy(null); } }} className="rounded-md border border-green-300 px-2 py-1 text-xs font-semibold text-green-800 hover:bg-green-50 disabled:opacity-50">Approve</button>}
                {i === 1 && <button type="button" disabled={rejectBusy !== null || secondLookIds.includes(person.id) || Boolean(batch.find(c => c.id === person.id)?.outreach_second_look_at)} onClick={async e => { e.preventDefault(); e.stopPropagation(); if (rejectBusy !== null || secondLookIds.includes(person.id)) return; setRejectBusy(person.id); try { const result = await secondLookCreator({data:{id:person.id}}); if (!result?.ok) throw new Error("Not confirmed"); setSecondLookIds(prev => [...prev,person.id]); setBatch(prev => prev.map(c => c.id === person.id ? {...c,outreach_second_look_at:new Date().toISOString()} : c)); await hydrateCreatorsFromDB(); } catch(err) { window.alert("Could not move to Second Look: "+String(err)); } finally { setRejectBusy(null); } }} className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50">Second Look</button>}
                {i === 1 && <button type="button" disabled={rejectBusy === person.id} onClick={async e => { e.preventDefault(); e.stopPropagation(); if (!window.confirm(`Reject ${person.name}? This manual decision overrides AI screening.`)) return; setRejectBusy(person.id); try { const result = await rejectCreator({data:{id:person.id,decision:"rejected",checkedProfile:true,evidence:"Manually rejected in AI Screened"}}); if (!result?.ok) throw new Error("Rejection not confirmed"); setBatch(prev => prev.map(c => c.id === person.id ? {...c,seth_approval_status:"rejected"} : c)); await hydrateCreatorsFromDB(); } catch(err) { window.alert("Could not reject: "+String(err)); } finally { setRejectBusy(null); } }} className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{rejectBusy === person.id ? "Saving…" : "Reject"}</button>}
                {i === 2 && <button type="button" disabled={rejectBusy !== null} onClick={async e => { e.preventDefault(); e.stopPropagation(); if (rejectBusy !== null) return; setRejectBusy(person.id); try { const result = await approvedSecondLook({data:{id:person.id,action:"later"}}); if (!result?.ok) throw new Error("Move not confirmed"); setSecondLookIds(prev => [...prev,person.id]); setBatch(prev => prev.map(c => c.id === person.id ? {...c,outreach_second_look_at:new Date().toISOString()} : c)); await hydrateCreatorsFromDB(); } catch(err) { window.alert("Could not move to Second Look: "+String(err)); } finally { setRejectBusy(null); } }} className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50">Second Look</button>}
                {i === 2 && <button type="button" disabled={rejectBusy !== null} onClick={async e => { e.preventDefault(); e.stopPropagation(); if (rejectBusy !== null) return; if (!window.confirm(`Reject approved creator ${person.name}?`)) return; setRejectBusy(person.id); try { const result = await rejectCreator({data:{id:person.id,decision:"rejected",checkedProfile:true,evidence:"Manual rejection from Already Manually Approved"}}); if (!result?.ok) throw new Error("Rejection not confirmed"); setBatch(prev => prev.map(c => c.id === person.id ? {...c,seth_approval_status:"rejected"} : c)); await hydrateCreatorsFromDB(); } catch(err) { window.alert("Could not reject: "+String(err)); } finally { setRejectBusy(null); } }} className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>}
                {i !== 1 && person.dm && <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard.writeText(draftEdits[person.id] ?? person.dm!); setDraftNotice(prev => ({...prev,[person.id]:"DM copied"})); }} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-foreground hover:bg-primary/20" title="Copy personalized DM without opening details">Copy DM</button>}
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
                  <textarea id={`dm-${person.id}`} rows={5} className="mt-2 w-full resize-y rounded-lg border bg-background p-3 text-sm" value={draftEdits[person.id] ?? person.dm} onChange={e => setDraftEdits(prev => ({...prev,[person.id]:e.target.value}))} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={draftBusy === person.id || !(draftEdits[person.id] ?? person.dm).trim()} className="rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50" onClick={async () => {
                      setDraftBusy(person.id); setDraftNotice(prev => ({...prev,[person.id]:""}));
                      try {
                        const saved = await saveDraft({data:{id:person.id,dm:draftEdits[person.id] ?? person.dm!}});
                        setBatch(prev => prev.map(c => c.id === person.id ? {...c,personalized_dm:saved.personalized_dm} : c));
                        setDraftNotice(prev => ({...prev,[person.id]:"Saved to CRM"}));
                      } catch (e) {setDraftNotice(prev => ({...prev,[person.id]:"Save failed: "+String(e)}));}
                      finally {setDraftBusy(null);}
                    }}>{draftBusy === person.id ? "Saving…" : "Save DM"}</button>
                    <button type="button" className="rounded-lg border px-3 py-2" onClick={() => void navigator.clipboard.writeText(draftEdits[person.id] ?? person.dm!)}>Copy DM</button>
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
            </details>)}
          </div>
        </>}
      </div>}
    </section>)}
  </main>;
}
