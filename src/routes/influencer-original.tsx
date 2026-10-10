import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listInfluencerOriginals } from "@/lib/influencer-master.functions";

export const Route = createFileRoute("/influencer-original")({ component: OriginalList });
type Row = { source_table: string; source_id: string; display_name: string; tiktok_url?: string | null; youtube_url?: string | null; instagram_url?: string | null; facebook_url?: string | null; original_data: Record<string, unknown> };
function OriginalList() {
  const load = useServerFn(listInfluencerOriginals);
  const [page, setPage] = useState(0);
  const [source, setSource] = useState("");
  const [result, setResult] = useState<{ rows: Row[]; total: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; setError(""); load({ data: { page, source } }).then(r => { if(active) setResult(r as {rows: Row[];total:number}) }).catch(e => { if(active) setError(String(e)) }); return () => {active=false}; }, [load,page,source]);
  return <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
    <Link to="/" className="underline">← Influencers</Link>
    <h1 className="text-2xl font-bold">7. Original List</h1>
    <p>Permanent source records. Every source field and historical note is preserved; research adds information without replacing it.</p>
    <select className="rounded border p-2" value={source} onChange={e=>{setSource(e.target.value);setPage(0)}}>
      <option value="">All platforms and sources</option>
      {["creators","creators_archive","youtube_candidates","reviewed_creators","bobo_staging"].map(s=><option key={s} value={s}>{s}</option>)}
    </select>
    <p>{result ? `${result.total.toLocaleString()} source records` : "Loading records…"}</p>
    {error && <p role="alert">{error}</p>}
    <div className="space-y-2">{result?.rows.map(r=><details key={r.source_table+":"+r.source_id} className="rounded border p-3">
      <summary className="cursor-pointer font-medium">{r.display_name || r.source_id} <span className="text-sm text-muted-foreground">· {r.source_table}</span></summary>
      <div className="mt-2 flex flex-wrap gap-3">{[r.tiktok_url,r.youtube_url,r.instagram_url,r.facebook_url].filter(Boolean).map(url=><a key={url!} href={url!} target="_blank" rel="noopener noreferrer" className="underline">{url!.replace(/^https?:\/\//,"").split("/")[0]}</a>)}</div>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">{JSON.stringify(r.original_data,null,2)}</pre>
    </details>)}</div>
    <div className="flex gap-3"><button className="rounded border px-4 py-2" disabled={page===0} onClick={()=>setPage(x=>x-1)}>Previous</button><span>Page {page+1}</span><button className="rounded border px-4 py-2" disabled={!result|| (page+1)*100>=result.total} onClick={()=>setPage(x=>x+1)}>Next</button></div>
  </main>;
}
