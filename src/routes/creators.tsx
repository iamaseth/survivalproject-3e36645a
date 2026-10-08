import { SethReviewPanel } from "@/components/SethReviewPanel";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Download, ExternalLink, Facebook, Globe, Image as ImageIcon, Instagram, Loader2, Mail, MessageCircle, Printer, Search, Upload, Youtube, X } from "lucide-react";
import { CREATORS, creatorOutreachStage, creatorPersonalizationReady, creatorReadyToContact, type CreatorRow, useCreatorsVersion } from "@/lib/creator-partnerships";
import { importCreatorPersonalization, importCreatorQualifications, updateCreatorWorkflow } from "@/lib/creators.functions";
import { externalLinkProps, outlookComposeUrl } from "@/lib/external-link";
import { listEmailTemplates } from "@/lib/templates.functions";
import { applyMergeFields, mergeContextForCreator, orderTemplatesForCreator, type EmailTemplate } from "@/lib/templates";
import { PipelineCounters, YouTubeCandidatesSection, useYouTubePipeline } from "@/components/creators/YouTubeCandidates";

export const Route = createFileRoute("/creators")({ component: CreatorsLayout, head: () => ({ meta: [{ title: "Creators — Survival Tabs" }, { name: "description", content: "Simple creator outreach workflow." }, { property: "og:title", content: "Creators — Survival Tabs" }, { property: "og:description", content: "Review creators and manage the Survival Tabs outreach workflow." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });
function CreatorsLayout() { const pathname = useRouterState({ select: (s) => s.location.pathname }); if (pathname !== "/creators") return <Outlet />; return <CreatorPipeline />; }
type StageKey = "not_contacted" | "contacted" | "follow_up" | "responded" | "sample";
type PlatformFilter = "all" | "youtube" | "tiktok" | "instagram" | "facebook" | "amazon" | "website";
type ContactFilter = "all" | "multiple" | "email" | "dm" | "form" | "youtube_only" | "none";
type CreatorPlatform = Exclude<PlatformFilter, "all">;
type ContactCategory = Exclude<ContactFilter, "all">;

function personalizationReady(c: CreatorRow) { return Boolean(c.personalizedDm?.trim() || c.personalizedEmailBody?.trim()); }

const PLATFORM_OPTIONS: Array<{ value: PlatformFilter; label: string }> = [
  { value: "all", label: "All platforms" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "amazon", label: "Amazon" },
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
  { key: "not_contacted", step: 1, label: "Ready for Outreach", hint: "Qualified creators who have not been contacted yet." },
  { key: "contacted", step: 2, label: "Contacted / waiting", hint: "Message sent; waiting for a reply." },
  { key: "follow_up", step: 2, label: "Follow up", hint: "No reply after 5 days." },
  { key: "responded", step: 3, label: "Responded", hint: "Record the response; interested creators move to shipping." },
  { key: "sample", step: 4, label: "Sample / Shipping", hint: "Capture shipping details, prepare the package, and track delivery." },
];
function daysSince(date: string | null) { if (!date) return null; const start = new Date(`${date}T00:00:00`); if (Number.isNaN(start.getTime())) return null; return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000)); }
function stageFor(c: CreatorRow): StageKey { if (c.normalizedSampleStatus !== "Not Sent" && c.normalizedSampleStatus !== "Refused") return "sample"; if (c.responseState === "Replied — Interested" || c.responseState === "Replied — Declined") return "responded"; if (!c.contactedDate) return "not_contacted"; return (daysSince(c.contactedDate) ?? 0) >= 5 ? "follow_up" : "contacted"; }

function creatorPlatforms(c: CreatorRow): CreatorPlatform[] {
  const platforms: CreatorPlatform[] = [];
  if (c.youtube) platforms.push("youtube");
  if (c.tiktok) platforms.push("tiktok");
  if (c.instagram) platforms.push("instagram");
  if (c.facebook) platforms.push("facebook");
  if (c.amazon) platforms.push("amazon");
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
  const [personalizationOpen,setPersonalizationOpen]=useState(false);
  const [personalizedOpen,setPersonalizedOpen]=useState(false);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [rejectedOpen,setRejectedOpen]=useState(false);
  const [personalizationImporting,setPersonalizationImporting]=useState(false);
  const [qualificationImporting,setQualificationImporting]=useState(false);
  const importPersonalization=useServerFn(importCreatorPersonalization);
  const importQualifications=useServerFn(importCreatorQualifications);
  const [openStages, setOpenStages] = useState<Record<StageKey, boolean>>({ not_contacted: false, contacted: false, follow_up: false, responded: false, sample: false });
  const nicheOptions = useMemo(() => [...new Set(CREATORS.map(nicheLabel))].sort((a,b)=>a.localeCompare(b)), [version]);
  const creators = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CREATORS.filter((c) => {
      const matchesSearch = !needle || [c.name,c.followersSignal,c.reachSignal,c.email,c.youtube,c.instagram,c.facebook,c.tiktok,c.amazon,c.segment,c.responseFollowup,c.sampleStatus,nicheLabel(c)].some((v) => String(v ?? "").toLowerCase().includes(needle));
      const matchesPlatform = platformFilter === "all" || creatorPlatforms(c).includes(platformFilter);
      const category = contactCategory(c);
      const matchesContact = contactFilter === "all" || category === contactFilter || (contactFilter !== "multiple" && category === "multiple" && contactMethods(c).includes(contactFilter as "email" | "dm" | "form"));
      const matchesNiche = nicheFilter === "all" || nicheLabel(c) === nicheFilter;
      return matchesSearch && matchesPlatform && matchesContact && matchesNiche;
    });
  }, [query, platformFilter, contactFilter, nicheFilter, version]);
  const filtersActive = Boolean(query || platformFilter !== "all" || contactFilter !== "all" || nicheFilter !== "all");
  const grouped = useMemo(() => { const out: Record<StageKey, CreatorRow[]> = { not_contacted: [], contacted: [], follow_up: [], responded: [], sample: [] }; creators.forEach((c) => { if (c.qualificationStatus !== "Not Relevant") out[stageFor(c)].push(c); }); return out; }, [creators]);
  const rejectedCreators = useMemo(() => creators.filter(c => c.qualificationStatus === "Not Relevant" || c.sethApprovalStatus === "rejected"), [creators]);
  const needsReview = useMemo(() => creators.filter((c) => stageFor(c) === "not_contacted" && c.qualificationStatus !== "Qualified" && c.qualificationStatus !== "Not Relevant"), [creators]);
  const needsPersonalization = useMemo(() => creators.filter((c) => stageFor(c) === "not_contacted" && !personalizationReady(c) && c.personalizationStatus?.toLowerCase() !== "needs review"), [creators]);
  const readyToContact = useMemo(() => creators.filter((c) => stageFor(c) === "not_contacted" && personalizationReady(c) && c.qualificationStatus !== "Not Relevant"), [creators]);
  const outreachGrouped = useMemo(() => ({ ...grouped, not_contacted: grouped.not_contacted.filter((c) => !personalizationReady(c)) }), [grouped]);
  const lastImport = typeof window !== "undefined" ? (() => { try { return JSON.parse(window.localStorage.getItem("survival-tabs-last-personalization-import") ?? "null") as {updated:number;skipped:number;total:number;file:string;at:string}|null; } catch { return null; } })() : null;
  const exportFilteredCreators = () => {
    const safe = (value: unknown) => String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ");
    const header = ["Creator ID", "Creator", "TikTok URL", "YouTube URL", "Instagram URL", "Facebook URL", "Amazon URL", "Other/Profile URL", "Email", "Niche", "Qualification Status", "Contacted Date", "Outreach Stage", "Research Status", "Research Notes", "Verification Evidence", "Recent Activity Check", "Full Verification", "Personalization Status", "Personalized DM", "Contact Method"];
    const rows = creators.map(c => [c.id, c.name, c.tiktok, c.youtube, c.instagram, c.facebook, c.amazon, c.otherPlatform ?? c.contactRoute, c.email, nicheLabel(c), c.qualificationStatus, c.contactedDate, stageFor(c), c.researchStatus, c.researchNotes, c.verificationEvidence, c.recentActivityCheck, c.fullVerification, c.personalizationStatus, c.personalizedDm, c.contactMethod]);
    const csv = [header, ...rows].map(row => row.map(value => `"${safe(value)}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `survival-tabs-filtered-creators-${creators.length}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${creators.length} matching creators`);
  };
  const exportPersonalization = (limit: number) => {
    const eligible = platformFilter === "all" ? needsPersonalization : needsPersonalization.filter((creator) => creatorPlatforms(creator).includes(platformFilter));
    const batch = eligible.slice(0, limit);
    const safe=(v:string|null|undefined)=>String(v??"").replace(/"/g,'""').replace(/\\r?\\n/g," ");
    const header=["Creator ID","Creator","Email","TikTok URL","YouTube URL","Instagram URL","Facebook URL","Amazon URL","Other/Profile URL","Niche","Research Notes","Personalization Status","Personalized DM","Personalized Email Subject","Personalized Email Body","Personalization Source"];
    const lines=[header,...batch.map((x)=>[x.id,x.name,x.email??"",x.tiktok??"",x.youtube??"",x.instagram??"",x.facebook??"",x.amazon??"",x.otherPlatform??x.contactRoute??"",nicheLabel(x),x.researchNotes??"","Needs Personalization","","","",""])].map(row=>row.map(v=>`"${safe(v)}"`).join(","));
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`survival-tabs-personalization-${platformFilter === "all" ? "all" : platformFilter}-next-${batch.length}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportReadyToContact = () => {
    const eligible = platformFilter === "all" ? readyToContact : readyToContact.filter((creator) => creatorPlatforms(creator).includes(platformFilter));
    const safe=(v:string|null|undefined)=>String(v??"").replace(/"/g,'""').replace(/\r?\n/g," ");
    const header=["Creator ID","Creator","TikTok URL","Niche","Research Notes","Research Status","Verification Evidence","Recent Activity Check","Full Verification","Personalization Status","Personalized DM","Personalization Source"];
    const lines=[header,...eligible.map((x)=>[x.id,x.name,x.tiktok??"",nicheLabel(x),x.researchNotes??"",x.researchStatus??"",x.verificationEvidence??"",x.recentActivityCheck??"",x.fullVerification??"",x.personalizationStatus??"",x.personalizedDm??"",x.personalizationSource??""])].map(row=>row.map(v=>`"${safe(v)}"`).join(","));
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`survival-tabs-ready-to-contact-${platformFilter === "all" ? "all" : platformFilter}-${eligible.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importPersonalizationCsv = async (file: File) => {
    setPersonalizationImporting(true);
    try {
      const text = await file.text();
      const parsed: string[][] = [];
      let row: string[] = [], field = "", quoted = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
          if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
          else if (ch === '"') quoted = false;
          else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\n") { row.push(field.replace(/\r$/, "")); parsed.push(row); row = []; field = ""; }
        else field += ch;
      }
      if (field.length || row.length) { row.push(field.replace(/\r$/, "")); parsed.push(row); }
      const header = (parsed.shift() ?? []).map((h) => h.replace(/^\uFEFF/, "").trim());
      const col = (name: string) => header.indexOf(name);
      const required = ["Creator ID", "Personalized DM", "Personalized Email Subject", "Personalized Email Body", "Personalization Source"];
      if (required.some((name) => col(name) < 0)) throw new Error("This is not a Survival Tabs personalization CSV.");
      const rows = parsed.filter((r) => r.some((v) => v.trim())).map((r) => ({
        id: r[col("Creator ID")]?.trim() ?? "",
        personalized_dm: r[col("Personalized DM")] ?? "",
        personalized_email_subject: r[col("Personalized Email Subject")] ?? "",
        personalized_email_body: r[col("Personalized Email Body")] ?? "",
        personalization_source: r[col("Personalization Source")] ?? "",
        personalization_status: col("Personalization Status") >= 0 ? (r[col("Personalization Status")] ?? "") : "",
      }));
      if (!rows.length) throw new Error("No creator rows found in the CSV.");
      const result = await importPersonalization({ data: { rows } });
      window.localStorage.setItem("survival-tabs-last-personalization-import", JSON.stringify({ updated: result.updated, skipped: result.skipped, total: result.total, file: file.name, at: new Date().toISOString() }));
      toast.success(`Personalization imported: ${result.updated} updated, ${result.skipped} skipped.`);
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not import personalization CSV");
    } finally {
      setPersonalizationImporting(false);
    }
  };
  const importQualificationCsv = async (file: File) => {
    setQualificationImporting(true);
    try {
      const text = await file.text();
      const parsed: string[][] = [];
      let row: string[] = [], field = "", quoted = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
          if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
          else if (ch === '"') quoted = false;
          else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\n") { row.push(field.replace(/\r$/, "")); parsed.push(row); row = []; field = ""; }
        else field += ch;
      }
      if (field.length || row.length) { row.push(field.replace(/\r$/, "")); parsed.push(row); }
      const header = (parsed.shift() ?? []).map((h) => h.replace(/^\uFEFF/, "").trim());
      const idCol = header.indexOf("Creator ID");
      const statusCol = header.indexOf("Qualification Status");
      if (idCol < 0 || statusCol < 0) throw new Error("CSV must contain Creator ID and Qualification Status.");
      const allowed = new Set(["Qualified", "Needs Review", "Not Relevant"]);
      const rows = parsed.filter((r) => r.some((v) => v.trim())).map((r) => ({
        id: r[idCol]?.trim() ?? "",
        qualification_status: r[statusCol]?.trim() as "Qualified" | "Needs Review" | "Not Relevant",
      }));
      if (!rows.length) throw new Error("No creator rows found.");
      if (rows.some((r) => !r.id || !allowed.has(r.qualification_status))) throw new Error("CSV contains an invalid Creator ID or Qualification Status.");
      const result = await importQualifications({ data: { rows } });
      toast.success(`Qualification imported: ${result.updated} updated, ${result.skipped} skipped.`);
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not import qualification CSV");
    } finally {
      setQualificationImporting(false);
    }
  };
  const { rows: ytRows, totals, refresh: refreshYT } = useYouTubePipeline();
  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl text-foreground">Creators</h1><label><span className="sr-only">Choose creator platform</span><select value={platformFilter} onChange={(e)=>setPlatformFilter(e.target.value as PlatformFilter)} className="min-w-[170px] rounded-md border-2 border-input bg-background px-3 py-2 text-base font-semibold">{PLATFORM_OPTIONS.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div></div><div /></div>
    <div className="mb-4 rounded-xl border border-border bg-card p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_210px_220px_auto]">
        <label className="relative"><span className="sr-only">Search creators</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search creator, platform or niche…" className="w-full rounded-md border border-input bg-background py-2.5 pl-9 pr-3 text-sm"/></label>
        <label><span className="sr-only">Filter by contact method</span><select value={contactFilter} onChange={(e)=>setContactFilter(e.target.value as ContactFilter)} className="h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{CONTACT_OPTIONS.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span className="sr-only">Filter by niche</span><select value={nicheFilter} onChange={(e)=>setNicheFilter(e.target.value)} className="h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="all">All niches</option>{nicheOptions.map((niche)=><option key={niche} value={niche}>{niche}</option>)}</select></label>
        {filtersActive?<button onClick={()=>{setQuery("");setPlatformFilter("all");setContactFilter("all");setNicheFilter("all");}} className="inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary"><X className="h-4 w-4"/> Clear</button>:<div className="hidden lg:block"/>}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Showing {creators.length} of {CREATORS.length} creators. Platform describes where they publish; contact method describes how Rena can reach them.</div><div className="mt-3 flex flex-wrap items-center gap-2"><label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-secondary ${qualificationImporting ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-4 w-4"/>{qualificationImporting ? "Importing qualification…" : "Import Qualification CSV"}<input type="file" accept=".csv,text/csv" className="hidden" disabled={qualificationImporting} onChange={(e)=>{const file=e.target.files?.[0]; if(file) void importQualificationCsv(file); e.currentTarget.value="";}}/></label><button type="button" onClick={exportFilteredCreators} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"><Download className="h-4 w-4"/>Export Filtered Creators CSV ({creators.length})</button><span className="text-xs text-muted-foreground">Updates only Creator ID + Qualification Status.</span></div>
    </div>
    <div className="space-y-3"><SethReviewPanel/><section className="overflow-hidden rounded-xl border border-border bg-card"><button onClick={()=>setReviewOpen(v=>!v)} aria-expanded={reviewOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">{reviewOpen?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}<div className="grid h-7 w-7 place-items-center rounded-full bg-amber-600 text-xs font-semibold text-white">?</div><div className="min-w-0 flex-1"><div className="font-semibold">Needs Manual Review <span className="ml-1 text-sm font-normal text-muted-foreground">({needsReview.length})</span></div><div className="text-xs text-muted-foreground">Research and personalize before final approval.</div></div><span className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium">{reviewOpen?"Close":"Open"}</span></button>{reviewOpen?<div className="border-t border-border">{needsReview.length===0?<div className="px-4 py-5 text-sm text-muted-foreground">Nothing here.</div>:needsReview.map((creator)=><CreatorLine key={creator.id} creator={creator}/>)}</div>:null}</section><section className="overflow-hidden rounded-xl border border-border bg-card"><button type="button" onClick={()=>setRejectedOpen(v=>!v)} aria-expanded={rejectedOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">{rejectedOpen?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}<div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">3</div><div className="min-w-0 flex-1 font-semibold">Rejected <span className="text-sm font-normal text-muted-foreground">({rejectedCreators.length})</span></div><span className="text-xs text-muted-foreground">{rejectedOpen?"Close":"Open"}</span></button>{rejectedOpen&&<div className="border-t border-border">{rejectedCreators.map(c=><CreatorLine key={c.id} creator={c}/>)}</div>}</section>{STAGES.filter((stage)=>stage.key!=="not_contacted").map((stage)=><StageSection key={stage.key} stage={stage} rows={grouped[stage.key]} open={openStages[stage.key]} toggle={()=>setOpenStages((s)=>({...s,[stage.key]:!s[stage.key]}))}/>)} <YouTubeCandidatesSection rows={ytRows} refresh={refreshYT}/></div>
    <div className="mt-8"><PipelineCounters counts={totals}/></div>
  </div>;
}
function StageSection({stage,rows,open,toggle}:{stage:{key:StageKey;step:number;label:string;hint:string};rows:CreatorRow[];open:boolean;toggle:()=>void}) {
  const today=new Date().toISOString().slice(0,10);
  const todaysConfirmed=stage.key==="contacted"?CREATORS.filter((creator)=>creator.contactedDate===today&&creator.responseFollowup!=="Contact confirmation pending"):[];
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><button onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">{open?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}<div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{stage.step}</div><div className="min-w-0 flex-1"><div className="font-semibold">{stage.label} <span className="ml-1 text-sm font-normal text-muted-foreground">({rows.length})</span></div><div className="text-xs text-muted-foreground">{stage.hint}</div></div><span className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground">{open?"Close":"Open"}</span></button>{open?<div className="border-t border-border">{stage.key==="contacted"?<RenaDailyReport rows={todaysConfirmed} date={today}/>:null}{rows.length===0?<div className="px-4 py-5 text-sm text-muted-foreground">Nothing here.</div>:null}{rows.map((creator)=><CreatorLine key={creator.id} creator={creator}/>)}</div>:null}</section>;
}

function RenaDailyReport({rows,date}:{rows:CreatorRow[];date:string}) {
  const safe=(value:string|null|undefined)=>String(value??"").replace(/"/g,'""').replace(/\r?\n/g," ");
  const downloadCsv=()=>{
    const header=["Creator","TikTok","Contact method","Contacted date","Notes","Rena follow-up / reply"];
    const lines=[header,...rows.map((c)=>[c.name,c.tiktok??"",c.contactMethod??"",c.contactedDate??"",c.renaNotes??"",""])]
      .map((row)=>row.map((value)=>`"${safe(value)}"`).join(","));
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`rena-outreach-${date}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const printReport=()=>{
    const esc=(value:string|null|undefined)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const reportRows=rows.map((c)=>`<tr><td>${esc(c.name)}</td><td>${esc(c.tiktok)}</td><td>${esc(c.contactMethod)}</td><td>${esc(c.renaNotes)}</td><td class="write"></td></tr>`).join("");
    const w=window.open("","_blank"); if(!w){toast.error("Allow pop-ups to print the report");return;}
    w.document.write(`<!doctype html><html><head><title>Rena Outreach Report ${date}</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px;margin:0 0 4px}.meta{margin:0 0 14px;font-size:13px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #777;padding:6px;vertical-align:top}th{text-align:left;background:#eee}.write{min-width:170px;height:38px}a{color:#111}</style></head><body><h1>Survival Tabs — Creator Outreach Report</h1><div class="meta">${date} · Confirmed contacted: <strong>${rows.length}</strong></div><table><thead><tr><th>Creator</th><th>TikTok</th><th>Method</th><th>Notes</th><th>Rena follow-up / reply</th></tr></thead><tbody>${reportRows||'<tr><td colspan="5">No confirmed contacts today.</td></tr>'}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  };
  return <div className="border-b border-border bg-secondary/20 px-4 py-3 print:hidden"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">Rena daily outreach sheet</div><div className="text-xs text-muted-foreground">{date} · {rows.length} confirmed sent today. Only ✓ Sent confirmations are included.</div></div><div className="flex gap-2"><button type="button" onClick={printReport} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Printer className="h-4 w-4"/> View / Print</button><button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"><Download className="h-4 w-4"/> Download CSV</button></div></div></div>;
}

function ExternalButton({href,children,className}:{href:string;children:React.ReactNode;className?:string}) { return <a {...externalLinkProps(href)} className={className}>{children}</a>; }

function CreatorLine({ creator }: { creator: CreatorRow }) {
  const updateFn = useServerFn(updateCreatorWorkflow);
  const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false);
  const [emailComposerOpen,setEmailComposerOpen]=useState(false);
  const [manualMethod,setManualMethod]=useState(""); const [manualNote,setManualNote]=useState("");
  const [confirmationNote,setConfirmationNote]=useState("");
  const followers=creator.followersSignal||creator.reachSignal||"—"; const days=daysSince(creator.contactedDate); const stage=stageFor(creator);
  const platforms=creatorPlatforms(creator); const category=contactCategory(creator); const niche=nicheLabel(creator);
  const update=async(patch:any)=>{setBusy(true);try{await updateFn({data:{id:creator.id,...patch}});toast.success("Updated");window.location.reload();}catch(e:any){toast.error(e?.message??"Could not update creator");}finally{setBusy(false);}};
  const copyPersonalizedDm = async () => {
    const message = creator.personalizedDm?.trim();
    if (!message) { toast.error("No personalized DM saved for this creator"); return; }
    try { await navigator.clipboard.writeText(message); toast.success("Personalized DM copied"); }
    catch { toast.error("Could not copy personalized DM"); }
  };
  const beginContact = async (href: string) => {
    // Open synchronously from the click so popup blockers do not prevent outreach.
    const normalizedHref = /^https?:\/\//i.test(href.trim()) ? href.trim() : `https://${href.trim().replace(/^\/+/, "")}`;
    const opened = window.open(normalizedHref, "_blank");
    if (!opened) { toast.error("Browser blocked the profile tab. Allow pop-ups or use the link in creator details."); return; }
    if (stage === "not_contacted") await update({ response_followup: "Contact confirmation pending" });
  };
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
      <div><div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Contact via · {CONTACT_OPTIONS.find((x)=>x.value===category)?.label}</div><div className="flex flex-wrap gap-1">{creator.email?<button type="button" onClick={()=>setEmailComposerOpen(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Mail className="h-3.5 w-3.5"/> Email</button>:null}{creator.tiktok&&creator.personalizedDm?.trim()?<button type="button" onClick={()=>void copyPersonalizedDm()} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-secondary"><Copy className="h-3.5 w-3.5"/> Copy DM</button>:null}{creator.tiktok?<ContactButton href={creator.tiktok} onContact={() => void beginContact(creator.tiktok!)} label="TikTok" icon={<MessageCircle className="h-3.5 w-3.5"/>}/>:null}{creator.instagram?<ContactButton href={creator.instagram} onContact={() => void beginContact(creator.instagram!)} label="Instagram" icon={<Instagram className="h-3.5 w-3.5"/>}/>:null}{creator.facebook?<ContactButton href={creator.facebook} onContact={() => void beginContact(creator.facebook!)} label="Facebook" icon={<Facebook className="h-3.5 w-3.5"/>}/>:null}{isContactForm(creator)&&creator.contactRoute?<ContactButton href={creator.contactRoute} onContact={() => void beginContact(creator.contactRoute!)} label="Contact form" icon={<Globe className="h-3.5 w-3.5"/>}/>:null}{category==="youtube_only"&&creator.youtube?<ContactButton href={creator.youtube} onContact={() => void beginContact(creator.youtube!)} label="YouTube only" icon={<Youtube className="h-3.5 w-3.5"/>}/>:null}{category==="none"?<span className="text-xs font-medium text-amber-700">Research needed</span>:null}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Days</div><div>{days==null?"—":days}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</div><div className="truncate text-sm">{creator.responseState==="No Response"?"Waiting":creator.responseState.replace("Replied — ","")}</div></div>
      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sample / next</div><div className="truncate text-sm">{creator.normalizedSampleStatus!=="Not Sent"?creator.normalizedSampleStatus:creator.nextFollowUpDate||"—"}</div></div>
      <button onClick={()=>setOpen((v)=>!v)} className="rounded-md p-1 hover:bg-secondary" aria-label="Quick creator details">{open?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</button>
    </div>
    {open?<div className="border-t border-border bg-secondary/20 px-4 py-4"><div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-1 text-sm"><Detail label="Email" value={creator.email}/><Detail label="Instagram" value={creator.instagram} link/><Detail label="Facebook" value={creator.facebook} link/><Detail label="TikTok" value={creator.tiktok} link/><Detail label="YouTube" value={creator.youtube} link/><Detail label="Contact route" value={creator.contactRoute} link/><Detail label="Contacted" value={creator.contactedDate}/><Detail label="Method" value={creator.contactMethod}/></div>
      <div className="space-y-1 text-sm"><Detail label="Response / follow-up" value={creator.responseFollowup}/><Detail label="Sample" value={creator.sampleStatus}/><Detail label="Notes" value={creator.renaNotes||creator.researchNotes}/><Detail label="Audience" value={creator.targetAudience}/><Detail label="Location" value={creator.geography}/></div>
      <div className="flex min-w-[240px] flex-col gap-2">
        {creatorOutreachStage(creator)==="confirm_contact"?<div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm text-amber-950"><div className="font-semibold">Confirm contact</div><p className="text-xs">Opening TikTok/contact only moved this creator here. It does not count as contacted until you confirm the message was sent.</p>{creator.tiktok&&creator.personalizedDm?.trim()?<button type="button" onClick={()=>void copyPersonalizedDm()} className="w-full rounded-md border border-input bg-background px-3 py-2 font-medium">Copy Personalized DM</button>:null}{creator.tiktok?<button type="button" onClick={()=>window.open(creator.tiktok!, "_blank", "noopener,noreferrer")} className="w-full rounded-md border border-input bg-background px-3 py-2 font-medium">Open TikTok again</button>:null}<textarea value={confirmationNote} onChange={(e)=>setConfirmationNote(e.target.value)} placeholder="Additional notes (optional)" rows={2} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"/><button disabled={busy} onClick={()=>{const existing=(creator.renaNotes||"").trim();const note=confirmationNote.trim();const dated=note?`${new Date().toISOString().slice(0,10)} — Contact note: ${note}`:"";void update({contacted_date:new Date().toISOString().slice(0,10),contact_method:creator.contactMethod|| (creator.tiktok?"TikTok DM":creator.instagram?"Instagram DM":creator.facebook?"Facebook DM":creator.email?"Email":"Other"),response_followup:"Waiting reply",...(dated?{rena_notes:existing?`${existing}\n${dated}`:dated}:{})});}} className="w-full rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground disabled:opacity-50">✓ Sent — move to Contacted / waiting</button><button disabled={busy} onClick={()=>update({response_followup:null})} className="w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-50">Could not send — return to Ready</button></div>:null}
        {stage==="not_contacted"&&creator.email?<button disabled={busy} onClick={()=>setEmailComposerOpen(true)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Review email…</button>:null}
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
    {emailComposerOpen?<EmailComposerModal creator={creator} canConfirm={stage==="not_contacted"||creatorOutreachStage(creator)==="confirm_contact"} busy={busy} onConfirmSent={()=>update({contacted_date:new Date().toISOString().slice(0,10),contact_method:"Email",response_followup:"Waiting reply"})} onClose={()=>setEmailComposerOpen(false)}/>:null}
  </div>;
}

function EmailComposerModal({creator,onClose,onConfirmSent,canConfirm,busy}:{creator:CreatorRow;onClose:()=>void;onConfirmSent:()=>void;canConfirm:boolean;busy:boolean}) {
  const [confirming,setConfirming]=useState(false);
  const list=useServerFn(listEmailTemplates);
  const q=useQuery({queryKey:["email-templates","active"],queryFn:()=>list({data:{activeOnly:true}})});
  const templates=useMemo(()=>orderTemplatesForCreator((q.data?.templates??[]) as EmailTemplate[],creator.segment),[q.data,creator.segment]);
  const [selectedId,setSelectedId]=useState("");
  const selected=templates.find((t)=>t.id===selectedId)??templates[0]??null;
  const ctx=useMemo(()=>mergeContextForCreator(creator,"Rena"),[creator]);
  const subject=creator.personalizedEmailSubject?.trim() || (selected?applyMergeFields(selected.subject,ctx):"");
  const body=creator.personalizedEmailBody?.trim() || (selected?applyMergeFields(selected.body,ctx):"");
  const outlook=creator.email&&selected?outlookComposeUrl(creator.email,subject,body):"";
  const copyMessage=async()=>{
    await navigator.clipboard.writeText(`To: ${creator.email}\nSubject: ${subject}\n\n${body}`);
    toast.success("Message copied",{description:selected?.imageUrl?"Attach the template photo before sending.":"Ready to paste into email."});
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby={`email-title-${creator.id}`} onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
        <div><div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Prepare email</div><h2 id={`email-title-${creator.id}`} className="font-display text-2xl">Email {creator.name}</h2><div className="text-xs text-muted-foreground">{creator.personalizedEmailBody?"Saved personalized outreach is ready for review.":"No saved personalization yet — showing the approved base template."}</div></div>
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
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={copyMessage} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"><Copy className="h-4 w-4"/> Copy message</button><a {...externalLinkProps(outlook)} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"><Mail className="h-4 w-4"/> Open Outlook</a></div>
          <p className="text-right text-[11px] text-muted-foreground">Copying, opening Outlook, or closing this window does not change the creator's status.</p>
        </>}
        {canConfirm?<div className="rounded-md border border-border bg-secondary/30 p-3">
          {!confirming?<div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs text-muted-foreground">4. After the email has actually been sent from Outlook, confirm it here.</div><button type="button" onClick={()=>setConfirming(true)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">I sent this email…</button></div>
          :<div className="space-y-2"><div className="text-sm font-semibold">Confirm: was this email really sent to {creator.email}?</div><p className="text-xs text-muted-foreground">This moves {creator.name} out of Not Contacted to Contacted / waiting.</p><div className="flex justify-end gap-2"><button type="button" onClick={()=>setConfirming(false)} className="rounded-md border border-input bg-background px-4 py-2 text-sm">Cancel</button><button type="button" disabled={busy} onClick={onConfirmSent} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Yes, it was sent</button></div></div>}
        </div>:null}
      </div>
    </div>
  </div>;
}
function Detail({label,value,link=false}:{label:string;value:string|null;link?:boolean}) { if(!value)return null; return <div className="flex gap-2"><span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>{link&&value.startsWith("http")?<ExternalButton href={value} className="break-all underline underline-offset-4">{value}</ExternalButton>:<span className="break-words">{value}</span>}</div>; }

function PlatformBadge({platform}:{platform:CreatorPlatform}) {
  const labels: Record<CreatorPlatform,string> = {youtube:"YouTube",tiktok:"TikTok",instagram:"Instagram",facebook:"Facebook",amazon:"Amazon",website:"Website"};
  return <span className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium">{labels[platform]}</span>;
}

function ContactButton({href,label,icon,onContact}:{href:string;label:string;icon:React.ReactNode;onContact:()=>void}) {
  return <button type="button" onClick={onContact} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-secondary">{icon}{label}<ExternalLink className="h-3 w-3"/></button>;
}
