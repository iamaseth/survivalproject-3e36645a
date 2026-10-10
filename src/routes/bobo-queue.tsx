import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listBoboResearchQueue } from "@/lib/influencer-master.functions";

export const Route = createFileRoute("/bobo-queue")({ component: BoboQueue });
type Candidate = {id:number;handle:string;profile_url:string;research_stage:string;md_content:string|null};
function BoboQueue() {
  const load = useServerFn(listBoboResearchQueue);
  const [page,setPage] = useState(0);
  const [result,setResult] = useState<{rows:Candidate[];total:number}|null>(null);
  const [error,setError] = useState("");
  useEffect(()=>{let active=true;load({data:{page}}).then(r=>{if(active)setResult(r as {rows:Candidate[];total:number})}).catch(e=>{if(active)setError(String(e))});return ()=>{active=false}},[load,page]);
  return <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
    <Link to="/" className="underline">← Influencers</Link>
    <h1 className="text-2xl font-bold">1. For Now — BoBo Research</h1>
    <p>Open each creator profile, use Obsidian Web Clipper to save an MD file, then attach the research to the original record. Original information is never replaced.</p>
    <p>{result ? `${result.total.toLocaleString()} new TikTok candidates` : "Loading queue…"}</p>
    {error && <p role="alert">{error}</p>}
    <div className="space-y-2">{result?.rows.map(r=><div key={r.id} className="flex items-center justify-between gap-4 rounded border p-3">
      <span className="min-w-0 truncate font-medium">@{r.handle}</span>
      <a href={r.profile_url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded border px-4 py-2 font-medium">Open Profile ↗</a>
    </div>)}</div>
    <div className="flex items-center gap-3"><button className="rounded border px-4 py-2" disabled={page===0} onClick={()=>setPage(x=>x-1)}>Previous</button><span>Page {page+1}</span><button className="rounded border px-4 py-2" disabled={!result||(page+1)*100>=result.total} onClick={()=>setPage(x=>x+1)}>Next</button></div>
  </main>;
}
