import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Mail, Search, Youtube } from "lucide-react";
import { CREATORS, type CreatorRow, useCreatorsVersion } from "@/lib/creator-partnerships";
import { externalLinkProps } from "@/lib/external-link";

export const Route = createFileRoute("/reviewed-survival-tabs-mre")({
  component: ReviewedSurvivalTabsMre,
  head: () => ({ meta: [{ title: "Reviewed Survival Tabs and MRE — Survival Tabs" }] }),
});

type StageKey = "not_contacted" | "contacted" | "follow_up" | "responded" | "sample";
const STAGES: Array<{ key: StageKey; step: number; label: string; hint: string }> = [
  { key: "not_contacted", step: 1, label: "Not contacted", hint: "Verified reviewers ready for outreach." },
  { key: "contacted", step: 2, label: "Contacted / waiting", hint: "Waiting for a reply." },
  { key: "follow_up", step: 3, label: "Follow up", hint: "No reply after 5 days." },
  { key: "responded", step: 4, label: "Responded", hint: "Handle the response and move interested creators to sample." },
  { key: "sample", step: 5, label: "Sample", hint: "Track address, shipping and delivery." },
];
function daysSince(date: string | null) { if (!date) return null; const d = new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime()) ? null : Math.max(0, Math.floor((Date.now()-d.getTime())/86400000)); }
function stageFor(c: CreatorRow): StageKey { if (c.normalizedSampleStatus !== "Not Sent" && c.normalizedSampleStatus !== "Refused") return "sample"; if (c.responseState === "Replied — Interested" || c.responseState === "Replied — Declined") return "responded"; if (!c.contactedDate) return "not_contacted"; return (daysSince(c.contactedDate) ?? 0) >= 5 ? "follow_up" : "contacted"; }

function ReviewedSurvivalTabsMre() {
  const version = useCreatorsVersion();
  const [query,setQuery] = useState("");
  const [open,setOpen] = useState<Record<StageKey,boolean>>({not_contacted:true,contacted:true,follow_up:true,responded:true,sample:true});
  const creators = useMemo(() => {
    const q=query.trim().toLowerCase();
    return CREATORS.filter(c => c.segment === "Reviewed Survival Tabs and MRE" && (!q || [c.name,c.followersSignal,c.email,c.youtube,c.instagram,c.tiktok,c.facebook,c.contactRoute].some(v=>String(v??"").toLowerCase().includes(q))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[query,version]);
  const grouped=useMemo(()=>{const o:Record<StageKey,CreatorRow[]>={not_contacted:[],contacted:[],follow_up:[],responded:[],sample:[]}; creators.forEach(c=>o[stageFor(c)].push(c)); return o;},[creators]);
  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-5"><div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Verified review creators</div><h1 className="font-display text-3xl text-foreground">Reviewed Survival Tabs and MRE</h1><p className="mt-1 text-sm text-muted-foreground">Verified creators who reviewed Survival Tabs, MREs, or closely related emergency food content. {creators.length} verified records.</p></div>
    <div className="mb-4 relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search creator, followers, email, social…" className="w-full max-w-xl rounded-md border border-input bg-card py-2.5 pl-9 pr-3 text-sm"/></div>
    <div className="space-y-3">{STAGES.map(s=><section key={s.key} className="overflow-hidden rounded-xl border border-border bg-card"><button onClick={()=>setOpen(v=>({...v,[s.key]:!v[s.key]}))} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">{open[s.key]?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}<div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{s.step}</div><div><div className="font-semibold">{s.label} <span className="text-sm font-normal text-muted-foreground">({grouped[s.key].length})</span></div><div className="text-xs text-muted-foreground">{s.hint}</div></div></button>{open[s.key]&&<div className="border-t border-border">{grouped[s.key].length===0?<div className="px-4 py-5 text-sm text-muted-foreground">Nothing here.</div>:grouped[s.key].map(c=><CreatorLine key={c.id} c={c}/>)}</div>}</section>)}</div>
  </div>;
}
function CreatorLine({c}:{c:CreatorRow}) { const [details,setDetails]=useState(false); const followers=c.followersSignal||c.reachSignal||"—"; return <div className="border-b border-border last:border-0"><div className="grid items-center gap-2 px-4 py-3 md:grid-cols-[minmax(190px,1.5fr)_150px_1fr_34px]"><div><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{followers}</div></div><div className="flex flex-wrap gap-1">{c.youtube&&<a href={c.youtube} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs"><Youtube className="h-3.5 w-3.5"/>YouTube</a>}</div><div className="flex flex-wrap gap-2 text-xs">{c.email?<a href={`mailto:${c.email}`} className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5"/>{c.email}</a>:c.contactRoute?.startsWith("http")?<a href={c.contactRoute} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Contact<ExternalLink className="h-3 w-3"/></a>:<span className="text-muted-foreground">No direct email yet</span>}</div><button onClick={()=>setDetails(v=>!v)} className="p-1">{details?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</button></div>{details&&<div className="border-t border-border bg-secondary/20 px-4 py-4 grid gap-2 md:grid-cols-2 text-sm"><Detail label="YouTube" value={c.youtube}/><Detail label="Instagram" value={c.instagram}/><Detail label="Facebook" value={c.facebook}/><Detail label="TikTok" value={c.tiktok}/><Detail label="Email" value={c.email}/><Detail label="Contact" value={c.contactRoute}/><Detail label="Other" value={c.otherPlatform}/><Detail label="Verification" value={c.fullVerification}/><Link to="/creators/$id" params={{id:c.id}} className="text-xs underline">Full creator details</Link></div>}</div>; }
function Detail({label,value}:{label:string;value:string|null}) { if(!value)return null; const link=value.startsWith("http"); return <div className="flex gap-2"><span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>{link?<a href={value} target="_blank" rel="noreferrer" className="break-all underline">{value}</a>:<span className="break-words">{value}</span>}</div>; }
