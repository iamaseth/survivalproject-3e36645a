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
  return <section className="space-y-4 rounded-xl border-2 border-primary p-4">
    <h2 className="text-xl font-bold">New Creator Research / ស្រាវជ្រាវអ្នកបង្កើតថ្មី</h2>
    <p className="text-sm">Load the creator list once. Open TikTok, save the page in Obsidian, return and click Saved MD → Next. No typing or pasting required.</p>
    <label className="block rounded-lg border p-3 font-semibold">Load creator CSV / ផ្ទុក CSV
      <input type="file" accept=".csv,text/csv" className="mt-2 block w-full text-sm" onChange={e=>void upload(e.target.files?.[0])}/>
    </label>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg bg-muted p-3"><strong className="block text-2xl">{saved}</strong>Saved MD</div>
      <div className="rounded-lg bg-muted p-3"><strong className="block text-2xl">{remaining.length}</strong>Remaining</div>
      <div className="rounded-lg bg-muted p-3"><strong className="block text-2xl">{skipped}</strong>Skipped</div>
    </div>
    {current?<div className="space-y-3 rounded-lg border p-4">
      <strong className="block text-xl">@{current.handle}</strong>
      <a className="block rounded-lg bg-primary px-4 py-4 text-center text-lg font-bold text-primary-foreground" href={current.profile_url} target="_blank" rel="noopener noreferrer">Open TikTok Profile ↗ / បើក TikTok</a>
      <p className="text-sm">Copy real profile details into the Markdown template, save it in Obsidian, then press Next. Downloading a blank template is not research.</p>\n      <button className="w-full rounded-lg border px-4 py-3 font-semibold" onClick={downloadMd}>Download .md template / ទាញយកឯកសារ .md</button>
      <button className="w-full rounded-lg bg-emerald-700 px-4 py-4 text-lg font-bold text-white" onClick={()=>mark("saved")}>Saved MD → Next / រក្សាទុក → បន្ទាប់</button>
      <button className="w-full rounded-lg border px-4 py-3" onClick={()=>mark("skipped")}>Skip → Next / រំលង</button>
    </div>:creators.length?<p className="font-bold">All candidate profiles accounted for.</p>:<p>Load the CSV to begin.</p>}
    <div className="flex flex-wrap gap-3">
      <button className="rounded-lg border px-4 py-3" onClick={undo} disabled={!history.length}>Undo last</button>
      <button className="rounded-lg border px-4 py-3" onClick={exportProgress} disabled={!creators.length}>Export progress CSV</button>
    </div>
    <p className="text-xs text-muted-foreground">Progress is saved only in this browser. Export the progress CSV regularly. Importing this list does NOT add rows to the CRM database.</p>
  </section>;
}
