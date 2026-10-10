import { CREATORS, useCreatorsVersion, hydrateCreatorsFromDB } from "@/lib/creator-partnerships";
import { useEffect, useMemo, useState } from "react";

type Candidate = { handle: string; profile_url: string; first_pass_category?: string };
type Progress = Record<string, "saved" | "skipped">;
const DATA_KEY = "bobo-new-creator-candidates-v1";
const PROGRESS_KEY = "bobo-new-creator-progress-v1";

function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i=0; i<input.length; i++) {
    const c=input[i];
    if (c === '"') { if (quoted && input[i+1] === '"') { field += '"'; i++; } else quoted=!quoted; }
    else if (c === "," && !quoted) { row.push(field); field=""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i+1] === "\n") i++;
      row.push(field); if (row.some(v=>v.trim())) rows.push(row); row=[]; field="";
    } else field+=c;
  }
  row.push(field); if (row.some(v=>v.trim())) rows.push(row);
  return rows;
}
function normalizeHandle(value: string): string {
  const v=value.trim().toLowerCase().replace(/^@/,"");
  return /^[a-z0-9._]{2,30}$/.test(v) ? v : "";
}
export function BoboCandidateQueue() {
  const creatorsVersion = useCreatorsVersion();
  useEffect(()=>{ void hydrateCreatorsFromDB(); },[]);
  const [creators,setCreators]=useState<Candidate[]>([]);
  const [progress,setProgress]=useState<Progress>({});
  const [error,setError]=useState("");
  useEffect(()=>{
    try { setCreators(JSON.parse(localStorage.getItem(DATA_KEY)||"[]")); setProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY)||"{}")); } catch { setError("Could not load saved progress."); }
  },[]);
  const allCreators = useMemo(()=>{
    const byHandle = new Map<string,Candidate>();
    for (const c of CREATORS) {
      if (c.sethApprovalStatus === "rejected" || c.qualificationStatus === "Not Relevant") continue;
      const match = (c.tiktok || "").match(/(?:tiktok\.com\/)?@([a-zA-Z0-9._]+)/i);
      const handle = normalizeHandle(match?.[1] || "");
      if (handle) byHandle.set(handle,{handle,profile_url:`https://www.tiktok.com/@${handle}`});
    }
    for (const c of creators) if (!byHandle.has(c.handle)) byHandle.set(c.handle,c);
    return [...byHandle.values()];
  },[creators, creatorsVersion]);
  const saved=allCreators.filter(c=>progress[c.handle]==="saved").length;
  const skipped=allCreators.filter(c=>progress[c.handle]==="skipped").length;
  async function upload(file?:File) {
    if(!file)return;
    try {
      const rows=parseCsv((await file.text()).replace(/^\uFEFF/,""));
      const header=rows.shift()?.map(v=>v.trim().toLowerCase())||[];
      const handleCol=header.indexOf("handle"), catCol=header.indexOf("first_pass_category");
      if(handleCol<0) throw Error("CSV needs a handle column.");
      const seen=new Set<string>();
      const next=rows.map(r=>{
        const handle=normalizeHandle(r[handleCol]||"");
        return {handle,profile_url:`https://www.tiktok.com/@${handle}`,first_pass_category:catCol>=0?r[catCol]:""};
      }).filter(c=>c.handle&&!seen.has(c.handle)&&!!seen.add(c.handle));
      if(!next.length)throw Error("No valid TikTok handles found.");
      if(creators.length && !window.confirm("Replace the current candidate list? Saved progress will be retained for matching handles."))return;
      localStorage.setItem(DATA_KEY,JSON.stringify(next));setCreators(next);setError("");
    } catch(e) { setError(e instanceof Error?e.message:String(e)); }
  }
  function exportProgress() {
    const rows=[["handle","profile_url","markdown_status"],...allCreators.map(c=>[c.handle,c.profile_url,progress[c.handle]||"pending"])];
    const csv=rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(",")).join("\r\n");
    const a=document.createElement("a");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.href=url;a.download="bobo-creator-md-progress.csv";a.click();URL.revokeObjectURL(url);
  }
  return <section className="space-y-3">
    <h1 className="text-2xl font-bold">BoBo · TikTok Profiles</h1>
    {!creators.length && <label className="block rounded-lg border p-3 text-sm">New research profiles not loaded yet (1,534). Existing CRM profiles are shown below.
      <input type="file" accept=".csv,text/csv" className="mt-2 block w-full" onChange={e=>void upload(e.target.files?.[0])}/>
    </label>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <p className="font-semibold">{saved+skipped} opened / {allCreators.length} TikTok profiles</p>
    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{width:`${allCreators.length?(saved+skipped)/allCreators.length*100:0}%`}} /></div>
    <p className="text-xs text-muted-foreground">Click profile → Obsidian Clipper → return → next. The clip should include the bio and visible videos; missing information can be checked later.</p>
    <div className="space-y-1">
      {allCreators.map((c,i)=>{
        const finished=!!progress[c.handle];
        return <div key={c.handle} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${finished?"bg-muted opacity-60":""}`}>
          <span className={`w-8 shrink-0 text-center font-bold ${finished?"text-primary":""}`}>{finished?"✓":i+1}</span>
          <a className={`min-w-0 flex-1 py-2 font-medium ${finished?"line-through":""}`} href={c.profile_url} target="_blank" rel="noopener noreferrer"
            onClick={()=>{
              if(finished)return;
              const next={...progress,[c.handle]:"saved" as const};
              setProgress(next);localStorage.setItem(PROGRESS_KEY,JSON.stringify(next));
            }}>
            @{c.handle} ↗
          </a>
        </div>;
      })}
    </div>
    {!!allCreators.length && <div className="flex gap-3 pt-3">
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={exportProgress}>Export progress</button>
      <label className="rounded-lg border px-3 py-2 text-sm">Replace list<input type="file" accept=".csv,text/csv" className="sr-only" onChange={e=>void upload(e.target.files?.[0])}/></label>
    </div>}
  </section>;
}
