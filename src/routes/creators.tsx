import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, ExternalLink, Facebook, Globe, Image as ImageIcon, Instagram, Loader2, Mail, MessageCircle, Search, Youtube, X } from "lucide-react";
import { CREATORS, type CreatorRow, useCreatorsVersion } from "@/lib/creator-partnerships";
import { updateCreatorWorkflow } from "@/lib/creators.functions";
import { externalLinkProps, outlookComposeUrl } from "@/lib/external-link";
import { listEmailTemplates } from "@/lib/templates.functions";
import { applyMergeFields, mergeContextForCreator, orderTemplatesForCreator, type EmailTemplate } from "@/lib/templates";
import { PipelineCounters, YouTubeCandidatesSection, useYouTubePipeline } from "@/components/creators/YouTubeCandidates";

export const Route = createFileRoute("/creators")({ component: CreatorsLayout, head: () => ({ meta: [{ title: "Creators — Survival Tabs" }, { name: "description", content: "Simple creator outreach workflow." }] }) });
function CreatorsLayout() { const pathname = useRouterState({ select: (s) => s.location.pathname }); if (pathname !== "/creators") return <Outlet />; return <CreatorPipeline />; }
type StageKey = "not_contacted" | "contacted" | "follow_up" | "responded" | "sample";
type PlatformFilter = "all" | "youtube" | "tiktok" | "instagram" | "facebook" | "website";
type ContactFilter = "all" | "multiple" | "email" | "dm" | "form" | "youtube_only" | "none";
type CreatorPlatform = Exclude<PlatformFilter, "all">;
type ContactCategory = Exclude<ContactFilter, "all">;

const PLATFORM_OPTIONS: Array<{ value: PlatformFilter; label: string }> = [
  { value: "all", label: "All platforms" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website" },
];

const CONTACT_OPTIONS: Array<{ value: ContactFilter; label: string }> = [
  { value: "all", label: "All contact methods" },
  { value: "multiple", label: "Multiple methods" },
  { value: "email", label: "Public email" },
  { value: "dm", label: "Social DM" },
  { value: "form", label: "Contact form" },
  { value: "youtube_only", label: "YouTube only" },
  { value: "none", label: "No contact route" },
];
const STAGES: Array<{ key: StageKey; step: number; label: string; hint: string }> = [
  { key: "not_contacted", step: 1, label: "Not contacted", hint: "Pick a creator and send the first message." },
  { key: "contacted", step: 2, label: "Contacted / waiting", hint: "Waiting for a reply." },
  { key: "follow_up", step: 3, label: "Follow up", hint: "No reply after 5 days." },
  { key: "responded", step: 4, label: "Responded", hint: "Handle the response and move interested creators to sample." },
  { key: "sample", step: 5, label: "Sample", hint: "Track address, shipping and delivery." },
];
function daysSince(date: string | null) { if (!date) return null; const start = new Date(`${date}T00:00:00`); if (Number.isNaN(start.getTime())) return null; return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000)); }
function stageFor(c: CreatorRow): StageKey { if (c.normalizedSampleStatus !== "Not Sent" && c.normalizedSampleStatus !== "Refused") return "sample"; if (c.responseState === "Replied — Interested" || c.responseState === "Replied — Declined") return "responded"; if (!c.contactedDate) return "not_contacted"; return (daysSince(c.contactedDate) ?? 0) >= 5 ? "follow_up" : "contacted"; }

function creatorPlatforms(c: CreatorRow): CreatorPlatform[] {
  const platforms: CreatorPlatform[] = [];
  if (c.youtube) platforms.push("youtube");
  if (c.tiktok) platforms.push("tiktok");
  if (c.instagram) platforms.push("instagram");
  if (c.facebook) platforms.push("facebook");
  if (c.otherPlatform?.startsWith("http") || c.contactRoute?.startsWith("http") && !/youtube|youtu\.be|instagram|facebook|tiktok/i.test(c.contactRoute)) platforms.push("website");
  return platforms;
}

function isContactForm(c: CreatorRow) {
  return Boolean(c.contactRoute?.startsWith("http") && !/youtube|youtu\.be|instagram|facebook|tiktok/i.test(c.contactRoute));
}

function contactMethods(c: CreatorRow): Array<"email" | "dm" | "form"> {
  const methods: Array<"email" | "dm" | "form"> = [];
  if (c.email) methods.push("email");
  if (c.tiktok || c.instagram || c.facebook) methods.push("dm");
  if (isContactForm(c)) methods.push("form");
  return methods;
}

function contactCategory(c: CreatorRow): ContactCategory {
  const methods = contactMethods(c);
  if (methods.length > 1) return "multiple";
  if (methods[0]) return methods[0];
  if (c.youtube) return "youtube_only";
  return "none";
}

function nicheLabel(c: CreatorRow) {
  const text = `${c.segment ?? ""} ${c.targetAudience ?? ""} ${c.researchNotes ?? ""}`.toLowerCase();
  if (/food storage|survival food|emergency food|ration|pantry/.test(text)) return "Emergency food / storage";
  if (/homestead|off.grid|self.reli/.test(text)) return "Homesteading / off-grid";
  if (/camp|backpack|hiking|outdoor adventure/.test(text)) return "Camping / backpacking";
  if (/bushcraft|wilderness/.test(text)) return "Bushcraft / wilderness";
  if (/edc|tactical|everyday carry/.test(text)) return "EDC / tactical";
  if (/rv|van life|road trip|overland/.test(text)) return "RV / road trip";
  if (/family preparedness|family prep/.test(text)) return "Family preparedness";
  if (/disaster|earthquake|hurricane|wildfire|tornado|flood|blackout|power outage/.test(text)) return "Disaster preparedness";
  if (/gear|review/.test(text)) return "Survival gear reviewer";
  if (/prep|survival|emergency/.test(text)) return "Preparedness / prepper";
  return c.segment?.trim() || "Other creator";
}

function CreatorPipeline() {
  const version = useCreatorsVersion(); const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [openStages, setOpenStages] = useState<Record<StageKey, boolean>>({ not_contacted: true, contacted: true, follow_up: true, responded: true, sample: true });
  const nicheOptions = useMemo(() => [...new Set(CREATORS.map(nicheLabel))].sort((a,b)=>a.localeCompare(b)), [version]);
  const creators = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CREATORS.filter((c) => {
      const matchesSearch = !needle || [c.name,c.followersSignal,c.reachSignal,c.email,c.youtube,c.instagram,c.facebook,c.tiktok,c.segment,c.responseFollowup,c.sampleStatus,nicheLabel(c)].some((v) => String(v ?? "").toLowerCase().includes(needle));
      const matchesPlatform = platformFilter === "all" || creatorPlatforms(c).includes(platformFilter);
      const category = contactCategory(c);
      const matchesContact = contactFilter === "all" || category === contactFilter || (contactFilter !== "multiple" && category === "multiple" && contactMethods(c).includes(contactFilter as "email" | "dm" | "form"));
      const matchesNiche = nicheFilter === "all" || nicheLabel(c) === nicheFilter;
      return matchesSearch && matchesPlatform && matchesContact && matchesNiche;
    });
  }, [query, platformFilter, contactFilter, nicheFilter, version]);
  const filtersActive = Boolean(query || platformFilter !== "all" || contactFilter !== "all" || nicheFilter !== "all");
  const grouped = useMemo(() => { const out: Record<StageKey, CreatorRow[]> = { not_contacted: [], contacted: [], follow_up: [], responded: [], sample: [] }; creators.forEach((c) => out[stageFor(c)].push(c)); return out; }, [creators]);
  const { rows: ytRows, totals, refresh: refreshYT } = useYouTubePipeline();
  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div><h1 className="font-display text-3xl text-foreground">Creators</h1></div><div className="flex gap-2"><Link to="/creators/outreach" className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary">Bulk outreach queue</Link><Link to="/amazon-creators" className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary">Amazon creators</Link></div></div>
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Bulk sending is locked — the queue only prepares and reviews emails until the production mailbox is verified.</div>
    <PipelineCounters counts={totals}/>

    <div className="mb-4 rounded-xl border border-border bg-card p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_190px_210px_220px_auto]">
        <label className="relative"><span className="sr-only">Search creators</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search creator, platform or niche…" className="w-full rounded-md border border-input bg-background py-2.5 pl-9 pr-3 text-sm"/></label>
        <label><span className="sr-only">Filter by platform</span><select value={platformFilter} onChange={(e)=>setPlatformFilter(e.target.value as PlatformFilter)} className="h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{PLATFORM_OPTIONS.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span className="sr-only">Filter by contact method</span><select value={contactFilter} onChange={(e)=>setContactFilter(e.target.value as ContactFilter)} className="h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{CONTACT_OPTIONS.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span className="sr-only">Filter by niche</span><select value={nicheFilter} onChange={(e)=>setNicheFilter(e.target.value)} className="h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="all">All niches</option>{nicheOptions.map((niche)=><option key={niche} value={niche}>{niche}</option>)}</select></label>
        {filtersActive?<button onClick={()=>{setQuery("");setPlatformFilter("all");setContactFilter("all");setNicheFilter("all");}} className="inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary"><X className="h-4 w-4"/> Clear</button>:<div className="hidden lg:block"/>}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Showing {creators.length} of {CREATORS.length} creators. Platform describes where they publish; contact method describes how Rena can reach them.</div>
    </div>
    <div className="space-y-3">{STAGES.map((stage)=><StageSection key={stage.key} stage={stage} rows={grouped[stage.key]} open={openStages[stage.key]} toggle={()=>setOpenStages((s)=>({...s,[stage.key]:!s[stage.key]}))}/>)}<YouTubeCandidatesSection rows={ytRows} refresh={refreshYT}/></div>
  </div>;
}
function StageSection({stage,rows,open,toggle}:{stage:{key:StageKey;step:number;label:string;hint:string};rows:CreatorRow[];open:boolean;toggle:()=>void}) { return <section className="overflow-hidden rounded-xl border border-border bg-card"><button onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">{open?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}<div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{stage.step}</div><div className="min-w-0 flex-1"><div className="font-semibold">{stage.label} <span className="ml-1 text-sm font-normal text-muted-foreground">({rows.length})</span></div><div className="text-xs text-muted-foreground">{stage.hint}</div></div><span className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground">{open?"Close":"Open"}</span></button>{open?<div className="border-t border-border">{rows.length===0?<div className="px-4 py-5 text-sm text-muted-foreground">Nothing here.</div>:null}{rows.map((creator)=><CreatorLine key={creator.id} creator={creator}/>)}</div>:null}</section>; }

function ExternalButton({href,children,className}:{href:string;children:React.ReactNode;className?:string}) { return <a {...externalLinkProps(href)} className={className}>{children}</a>; }

function CreatorLine({ creator }: { creator: CreatorRow }) {
  const updateFn = useServerFn(updateCreatorWorkflow);
  const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false);
  const [emailComposerOpen,setEmailComposerOpen]=useState(false);
  const [manualMethod,setManualMethod]=useState(""); const [manualNote,setManualNote]=useState("");
  const followers=creator.followersSignal||creator.reachSignal||"—"; const days=daysSince(creator.contactedDate); const stage=stageFor(creator);
  const platforms=creatorPlatforms(creator); const category=contactCategory(creator); const niche=nicheLabel(creator);
  const update=async(patch:any)=>{setBusy(true);try{await updateFn({data:{id:creator.id,...patch}});toast.success("Updated");window.location.reload();}catch(e:any){toast.error(e?.message??"Could not update creator");}finally{setBusy(false);}};
  const markManualContacted=()=>{
    if(!manualMethod){toast.error("Choose how you contacted the creator");return;}
    if(!manualNote.trim()){toast.error("Add a short contact note before marking contacted");return;}
    const existing=(creator.renaNotes||"").trim();
    const dated=`${new Date().toISOString().slice(0,10)} — ${manualMethod}: ${manualNote.trim()}`;
    update({contacted_date:new Date().toISOString().slice(0,10),contact_method:manualMethod,response_followup:"Waiting reply",rena_notes:existing?`${existing}\n${dated}`:dated});
  };
  return <div className="border-b border-border last:border-0">
    <div className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(190px,1.35fr)_125px_minmax(150px,1fr)_minmax(170px,1.15fr)_70px_110px_120px_34px]">
      <div className="min-w-0"><Link to="/creators/$id" params={{id:creator.id}} className="block truncate font-medium hover:text-primary hover:underline hover:underline-offset-4">{creator.name}</Link><div className="truncate text-xs text-muted-foreground" title={niche}>{niche}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Followers</div><div className="font-semibold">{followers}</div></div>
      <div><div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Publishes on</div><div className="flex flex-wrap gap-1">{platforms.length?platforms.map((platform)=><PlatformBadge key={platform} platform={platform}/>):<span className="text-xs text-muted-foreground">Platform unverified</span>}</div></div>
      <div><div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Contact via · {CONTACT_OPTIONS.find((x)=>x.value===category)?.label}</div><div className="flex flex-wrap gap-1">{creator.email?<button type="button" onClick={()=>setEmailComposerOpen(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Mail className="h-3.5 w-3.5"/> Email</button>:null}{creator.tiktok?<ContactButton href={creator.tiktok} label="TikTok" icon={<MessageCircle className="h-3.5 w-3.5"/>}/>:null}{creator.instagram?<ContactButton href={creator.instagram} label="Instagram" icon={<Instagram className="h-3.5 w-3.5"/>}/>:null}{creator.facebook?<ContactButton href={creator.facebook} label="Facebook" icon={<Facebook className="h-3.5 w-3.5"/>}/>:null}{isContactForm(creator)&&creator.contactRoute?<ContactButton href={creator.contactRoute} label="Contact form" icon={<Globe className="h-3.5 w-3.5"/>}/>:null}{category==="youtube_only"&&creator.youtube?<ContactButton href={creator.youtube} label="YouTube only" icon={<Youtube className="h-3.5 w-3.5"/>}/>:null}{category==="none"?<span className="text-xs font-medium text-amber-700">Research needed</span>:null}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Days</div><div>{days==null?"—":days}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</div><div className="truncate text-sm">{creator.responseState==="No Response"?"Waiting":creator.responseState.replace("Replied — ","")}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sample / next</div><div className="truncate text-sm">{creator.normalizedSampleStatus!=="Not Sent"?creator.normalizedSampleStatus:creator.nextFollowUpDate||"—"}</div></div>
      <button onClick={()=>setOpen((v)=>!v)} className="rounded-md p-1 hover:bg-secondary" aria-label="Quick creator details">{open?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</button>
    </div>
    {open?<div className="border-t border-border bg-secondary/20 px-4 py-4"><div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-1 text-sm"><Detail label="Email" value={creator.email}/><Detail label="Instagram" value={creator.instagram} link/><Detail label="Facebook" value={creator.facebook} link/><Detail label="TikTok" value={creator.tiktok} link/><Detail label="YouTube" value={creator.youtube} link/><Detail label="Contact route" value={creator.contactRoute} link/><Detail label="Contacted" value={creator.contactedDate}/><Detail label="Method" value={creator.contactMethod}/></div>
      <div className="space-y-1 text-sm"><Detail label="Response / follow-up" value={creator.responseFollowup}/><Detail label="Sample" value={creator.sampleStatus}/><Detail label="Notes" value={creator.renaNotes||creator.researchNotes}/><Detail label="Audience" value={creator.targetAudience}/><Detail label="Location" value={creator.geography}/></div>
      <div className="flex min-w-[240px] flex-col gap-2">
        {stage==="not_contacted"&&creator.email?<button disabled={busy} onClick={()=>update({contacted_date:new Date().toISOString().slice(0,10),contact_method:"Email",response_followup:"Waiting reply"})} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Mark contacted today</button>:null}
        {stage==="not_contacted"&&!creator.email?<div className="rounded-md border border-border bg-background p-3 space-y-2">
          <div className="text-xs font-semibold">Manual contact</div>
          <select value={manualMethod} onChange={(e)=>setManualMethod(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm">
            <option value="">Choose method…</option><option>Contact Form</option><option>Instagram DM</option><option>Facebook DM</option><option>TikTok DM</option><option>YouTube Comment</option><option>Other</option>
          </select>
          <textarea value={manualNote} onChange={(e)=>setManualNote(e.target.value)} placeholder="Required note: what did you send / where?" rows={3} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"/>
          <button disabled={busy||!manualMethod||!manualNote.trim()} onClick={markManualContacted} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Mark contacted today</button>
          <div className="text-[11px] text-muted-foreground">For non-email outreach, method + note are required.</div>
        </div>:null}
        {(stage==="contacted"||stage==="follow_up")?<><button disabled={busy} onClick={()=>update({contacted_date:new Date().toISOString().slice(0,10),response_followup:"Follow-up sent — waiting reply"})} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Follow-up sent today</button><button disabled={busy} onClick={()=>update({response_followup:"Replied — Interested"})} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Interested response</button><button disabled={busy} onClick={()=>update({response_followup:"Replied — Declined"})} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Declined response</button></>:null}
        {stage==="responded"&&creator.responseState==="Replied — Interested"?<button disabled={busy} onClick={()=>update({sample_status:"Awaiting Address"})} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Start sample</button>:null}
        {stage==="sample"?<><button disabled={busy} onClick={()=>update({sample_status:"Address Received"})} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Address received</button><button disabled={busy} onClick={()=>update({sample_status:"Shipped"})} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Mark shipped</button><button disabled={busy} onClick={()=>update({sample_status:"Delivered"})} className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Mark delivered</button></>:null}
        <Link to="/creators/$id" params={{id:creator.id}} className="rounded-md border border-input bg-background px-3 py-2 text-center text-sm font-medium hover:bg-secondary">Open full creator record</Link>
      </div>
    </div></div>:null}
    {emailComposerOpen?<EmailComposerModal creator={creator} onClose={()=>setEmailComposerOpen(false)}/>:null}
  </div>;
}

function EmailComposerModal({creator,onClose}:{creator:CreatorRow;onClose:()=>void}) {
  const list=useServerFn(listEmailTemplates);
  const q=useQuery({queryKey:["email-templates","active"],queryFn:()=>list({data:{activeOnly:true}})});
  const templates=useMemo(()=>orderTemplatesForCreator((q.data?.templates??[]) as EmailTemplate[],creator.segment),[q.data,creator.segment]);
  const [selectedId,setSelectedId]=useState("");
  const selected=templates.find((t)=>t.id===selectedId)??templates[0]??null;
  const ctx=useMemo(()=>mergeContextForCreator(creator,"Rena"),[creator]);
  const subject=selected?applyMergeFields(selected.subject,ctx):"";
  const body=selected?applyMergeFields(selected.body,ctx):"";
  const outlook=creator.email&&selected?outlookComposeUrl(creator.email,subject,body):"";
  const copyMessage=async()=>{
    await navigator.clipboard.writeText(`To: ${creator.email}\nSubject: ${subject}\n\n${body}`);
    toast.success("Message copied",{description:selected?.imageUrl?"Attach the template photo before sending.":"Ready to paste into email."});
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby={`email-title-${creator.id}`} onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
        <div><div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Prepare email</div><h2 id={`email-title-${creator.id}`} className="font-display text-2xl">Email {creator.name}</h2><div className="text-xs text-muted-foreground">Nothing sends automatically.</div></div>
        <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-secondary" aria-label="Close email composer"><X className="h-5 w-5"/></button>
      </div>
      <div className="space-y-4 p-5">
        {q.isLoading?<div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading approved templates…</div>:q.error?<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Templates could not be loaded. Close this window and try again.</div>:templates.length===0?<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No approved templates are available. Ask Perry or an approved manager to approve one in Email Templates.</div>:<>
          <label className="block"><span className="mb-1 block text-xs font-semibold">1. Choose template</span><select value={selected?.id??""} onChange={(e)=>setSelectedId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm">{templates.map((t)=><option key={t.id} value={t.id}>{t.name}{t.segment?` — ${t.segment}`:""}</option>)}</select></label>
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-3"><div><div className="mb-1 text-xs font-semibold">2. Preview personalized message</div><div className="rounded-md border border-border bg-background p-3"><div className="border-b border-border pb-2 text-sm"><span className="text-muted-foreground">To:</span> {creator.email}</div><div className="border-b border-border py-2 text-sm"><span className="text-muted-foreground">Subject:</span> {subject}</div><div className="whitespace-pre-wrap pt-3 text-sm leading-6">{body}</div></div></div></div>
            <div><div className="mb-1 text-xs font-semibold">Template photo</div>{selected?.imageUrl?<div className="rounded-md border border-border bg-background p-2"><img src={selected.imageUrl} alt={selected.imageAlt||"Template product photo"} className="aspect-square w-full rounded object-contain"/><a {...externalLinkProps(selected.imageUrl)} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-input px-2 py-2 text-xs font-medium hover:bg-secondary"><ImageIcon className="h-3.5 w-3.5"/> Open photo</a><p className="mt-2 text-[11px] leading-4 text-amber-800">Attach this photo manually in Outlook.</p></div>:<div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">This template has no photo.</div>}</div>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900"><strong>3. Copy, then open Outlook.</strong> Outlook may be blocked inside Lovable Preview. Rena should use the published site. If Outlook still blocks, the message remains copied and can be pasted into a normal Outlook window.</div>
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={copyMessage} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"><Copy className="h-4 w-4"/> Copy message</button><a {...externalLinkProps(outlook)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Mail className="h-4 w-4"/> Open Outlook</a></div>
        </>}
      </div>
    </div>
  </div>;
}
function Detail({label,value,link=false}:{label:string;value:string|null;link?:boolean}) { if(!value)return null; return <div className="flex gap-2"><span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>{link&&value.startsWith("http")?<ExternalButton href={value} className="break-all underline underline-offset-4">{value}</ExternalButton>:<span className="break-words">{value}</span>}</div>; }

function PlatformBadge({platform}:{platform:CreatorPlatform}) {
  const labels: Record<CreatorPlatform,string> = {youtube:"YouTube",tiktok:"TikTok",instagram:"Instagram",facebook:"Facebook",website:"Website"};
  return <span className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium">{labels[platform]}</span>;
}

function ContactButton({href,label,icon}:{href:string;label:string;icon:React.ReactNode}) {
  return <ExternalButton href={href} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-secondary">{icon}{label}<ExternalLink className="h-3 w-3"/></ExternalButton>;
}
