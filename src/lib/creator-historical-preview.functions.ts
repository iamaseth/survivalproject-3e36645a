import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Historical merge PREVIEW ONLY. Never changes creator data or manual decisions.
type Row = Record<string, unknown>;
const sources = ["creators_archive", "reviewed_creators", "youtube_candidates"] as const;
const str = (x: unknown) => typeof x === "string" ? x.trim() : "";
const first = (r: Row, keys: string[]) => keys.map(k => str(r[k])).find(Boolean) || "";
const tt = (r: Row) => {
  const raw = first(r, ["tiktok_handle","tiktok","handle","profile_url"]).toLowerCase();
  const m = raw.match(/tiktok\.com\/@([a-z0-9._]+)/);
  return m ? m[1] : /^@?[a-z0-9._]{2,30}$/.test(raw) ? raw.replace(/^@/,"") : "";
};
const yt = (r: Row) => {
  const raw = first(r, ["youtube_url","youtube","channel_url","url","profile_url"]);
  const m = raw.match(/(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:@([\w.-]+)|channel\/([\w-]+)|c\/([\w.-]+)|user\/([\w.-]+))/i);
  return m ? (m[1] ? "handle:"+m[1].toLowerCase() : m[2] ? "channel:"+m[2].toLowerCase() : m[3] ? "custom:"+m[3].toLowerCase() : "user:"+m[4].toLowerCase()) : "";
};
const name = (r: Row) => first(r, ["display_name","name","creator_name","channel_name","username"]).toLowerCase().replace(/\s+/g," ");
const ids = (r: Row) => ({tiktok:tt(r),youtube:yt(r),name:name(r)});
async function rows(context: any, table: string) {
  const {count,error} = await context.supabase.from(table).select("*",{count:"exact",head:true});
  if(error) throw new Error(table+": "+error.message);
  if((count ?? 0)>20000) throw new Error(table+": more than 20000 rows; preview refused");
  const all: Row[]=[];
  for(let offset=0;offset<(count ?? 0);offset+=500){
    const {data,error:pageError}=await context.supabase.from(table).select("*").order("id").range(offset,offset+499);
    if(pageError) throw new Error(table+": "+pageError.message);
    all.push(...(data ?? []));
  }
  if(all.length !== (count ?? 0)) throw new Error(table+": incomplete read; preview refused");
  return all;
}
export const previewHistoricalMerge = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const master=(await rows(context,"creators")).map(ids);
    const t=new Set(master.map(x=>x.tiktok).filter(Boolean));
    const y=new Set(master.map(x=>x.youtube).filter(Boolean));
    const n=new Set(master.map(x=>x.name).filter(Boolean));
    const report=[];
    for(const table of sources){
      const source=(await rows(context,table)).map(ids);
      let exactTikTok=0, exactYouTube=0, nameReview=0, newIdentified=0, needsIdentity=0;
      const seen=new Set<string>();
      let duplicateWithinSource=0;
      for(const x of source){
        const key=x.tiktok ? "t:"+x.tiktok : x.youtube ? "y:"+x.youtube : "";
        if(key && seen.has(key)) duplicateWithinSource++;
        if(key) seen.add(key);
        if(x.tiktok && t.has(x.tiktok)) exactTikTok++;
        else if(x.youtube && y.has(x.youtube)) exactYouTube++;
        else if(x.name && n.has(x.name)) nameReview++;
        else if(x.tiktok || x.youtube) newIdentified++;
        else needsIdentity++;
      }
      report.push({table,rows:source.length,exactTikTok,exactYouTube,nameReview,newIdentified,needsIdentity,duplicateWithinSource});
    }
    return {readOnly:true,readyForMigration:false,report,
      warning:"Preview only. Exact URLs are candidate matches, not permission to overwrite records. Names and ambiguous identifiers require review."};
  });
