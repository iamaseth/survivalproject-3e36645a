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
  const [creators,setCreators]=useState<Candidate[]>([]);
  const [progress,setProgress]=useState<Progress>({});
  const [history,setHistory]=useState<string[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    try { setCreators(JSON.parse(localStorage.getItem(DATA_KEY)||"[]")); setProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY)||"{}")); } catch { setError("Could not load saved progress."); }
  },[]);
  const remaining=useMemo(()=>creators.filter(c=>!progress[c.handle]),[creators,progress]);
  const saved=creators.filter(c=>progress[c.handle]==="saved").length;
  const skipped=creators.filter(c=>progress[c.handle]==="skipped").length;
  const current=remaining[0];
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
  function markdownTemplate(c:Candidate):string {
    return `---\ntitle: "TikTok Research — @${c.handle}"\nsource: "${c.profile_url}"\ncreated: "${new Date().toISOString().slice(0,10)}"\ntags: [survival-tabs, influencer-research, bobo]\n---\n\n# @${c.handle}\n\n- Profile URL: ${c.profile_url}\n- Display name: \n- Followers (if visible): \n- Bio: \n- Research date: ${new Date().toISOString().slice(0,10)}\n\n## Recent content and evidence\n\nPaste relevant video captions, topics, and source links here.\n\n## Observations\n\nRecord what the creator actually posts. Do not qualify or draft a DM here.\n\n## Unverified or missing information\n\n`; 
  }
  function downloadMd() {
    if(!current)return;
    const blob=new Blob([markdownTemplate(current)],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`tiktok-${current.handle}.md`;a.click();URL.revokeObjectURL(url);
  }
  function mark(status:"saved"|"skipped") {
    if(!current)return;
    const next={...progress,[current.handle]:status};setProgress(next);localStorage.setItem(PROGRESS_KEY,JSON.stringify(next));
    setHistory(h=>[...h,current.handle]);setError("");
  }
  function undo() {
    const last=history[history.length-1];if(!last)return;
    const next={...progress};delete next[last];setProgress(next);localStorage.setItem(PROGRESS_KEY,JSON.stringify(next));setHistory(h=>h.slice(0,-1));
  }
  function exportProgress() {
    const rows=[["handle","profile_url","markdown_status"],...creators.map(c=>[c.handle,c.profile_url,progress[c.handle]||"pending"])];
    const csv=rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(",")).join("\r\n");
    const a=document.createElement("a");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.href=url;a.download="bobo-creator-md-progress.csv";a.click();URL.revokeObjectURL(url);
  }
  return <section className="space-y-3">
    <h1 className="text-2xl font-bold">BoBo · TikTok Profiles</h1>
    {!creators.length && <label className="block rounded-lg border p-3 text-sm">Load the 1,534 profiles once
      <input type="file" accept=".csv,text/csv" className="mt-2 block w-full" onChange={e=>void upload(e.target.files?.[0])}/>
    </label>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <p className="font-semibold">{saved+skipped} / {creators.length} done</p>
    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{width:`${creators.length?(saved+skipped)/creators.length*100:0}%`}} /></div>
    <p className="text-xs text-muted-foreground">Click a profile to open TikTok. Save the page to Obsidian, then return and click its circle to cross it off.</p>
    <div className="space-y-1">
      {creators.map((c,i)=>{
        const finished=!!progress[c.handle];
        return <div key={c.handle} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${finished?"bg-muted opacity-60":""}`}>
          <button aria-label={finished?"Undo completed":"Mark saved to Obsidian"} className={`h-8 w-8 shrink-0 rounded-full border-2 font-bold ${finished?"bg-primary text-primary-foreground":""}`}
            onClick={()=>{
              const next={...progress};if(finished)delete next[c.handle];else next[c.handle]="saved";
              setProgress(next);localStorage.setItem(PROGRESS_KEY,JSON.stringify(next));
            }}>{finished?"✓":""}</button>
          <a className={`min-w-0 flex-1 py-2 font-medium ${finished?"line-through":""}`} href={c.profile_url} target="_blank" rel="noopener noreferrer">
            {i+1}. @{c.handle} ↗
          </a>
        </div>;
      })}
    </div>
    {!!creators.length && <div className="flex gap-3 pt-3">
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={exportProgress}>Export progress</button>
      <label className="rounded-lg border px-3 py-2 text-sm">Replace list<input type="file" accept=".csv,text/csv" className="sr-only" onChange={e=>void upload(e.target.files?.[0])}/></label>
    </div>}
  </section>;
}
