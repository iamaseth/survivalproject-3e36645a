import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Additive only: existing master records and source tables are never updated/deleted.
const TABLES = ["youtube_candidates", "reviewed_creators"] as const;
type Row = Record<string, unknown>;
const val = (r:Row, keys:string[]) => keys.map(k=>typeof r[k]==="string" ? String(r[k]).trim() : "").find(Boolean) || "";
const normalize = (raw:string) => {
  const m=raw.toLowerCase().match(/tiktok\.com\/@([a-z0-9._]+)/);
  if(m) return m[1];
  return /^@?[a-z0-9._]{2,30}$/.test(raw.toLowerCase()) ? raw.toLowerCase().replace(/^@/,"") : "";
};
const yt = (raw:string) => {
  const m=raw.match(/(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:@([\w.-]+)|channel\/([\w-]+)|c\/([\w.-]+)|user\/([\w.-]+))/i);
  return m ? (m[1] ? "handle:"+m[1].toLowerCase() : m[2] ? "channel:"+m[2].toLowerCase() : m[3] ? "custom:"+m[3].toLowerCase() : "user:"+m[4].toLowerCase()) : "";
};
const youtubeUrl=(r:Row)=>val(r,["youtube_url","youtube","channel_url","url","profile_url"]);
const tiktokUrl=(r:Row)=>val(r,["tiktok","tiktok_url","profile_url"]);
const name=(r:Row)=>val(r,["display_name","name","creator_name","channel_name","username"]);
export const migrateHistoricalBatch=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((d:{table:string;offset:number;limit?:number;confirm:boolean})=>{
    if(!TABLES.includes(d?.table as typeof TABLES[number]) || !Number.isInteger(d.offset) || d.offset<0 ||
      (d.limit!==undefined && (!Number.isInteger(d.limit)||d.limit<1||d.limit>50)) || typeof d.confirm!=="boolean")
      throw new Error("Invalid historical import request");
    return { ...d, table: d.table as (typeof TABLES)[number] };
  })
  .handler(async ({context,data})=>{
    const limit=data.limit??50;
    const {data:source,error:sourceError}=await context.supabase.from(data.table)
      .select("*").order("id").range(data.offset,data.offset+limit-1);
    if(sourceError) throw new Error(sourceError.message);
    const {data:master,error:masterError}=await context.supabase.from("creators")
      .select("id,tiktok,tiktok_handle,youtube,name").order("id").limit(20000);
    if(masterError) throw new Error(masterError.message);
    const existingT=new Set((master??[]).map(r=>normalize(r.tiktok_handle||r.tiktok||"")).filter(Boolean));
    const existingY=new Set((master??[]).map(r=>yt(r.youtube||"")).filter(Boolean));
    const existingNames=new Set((master??[]).map(r=>(r.name||"").trim().toLowerCase()).filter(Boolean));
    const result={table:data.table,offset:data.offset,scanned:(source??[]).length,inserted:0,existing:0,
      review:0,errors:[] as string[],dryRun:!data.confirm};
    for(const raw of source??[]){
      const r=raw as Row, t=normalize(tiktokUrl(r)), url=youtubeUrl(r), y=yt(url);
      const display=name(r), normalizedName=display.toLowerCase();
      if((t&&existingT.has(t))||(y&&existingY.has(y))){result.existing++;continue;}
      // Name collisions, absent identifiers and video-only URLs require manual review.
      if((normalizedName&&existingNames.has(normalizedName))||(!t&&!y)){result.review++;continue;}
      const id="HIST-"+data.table.toUpperCase().replace(/[^A-Z_]/g,"")+"-"+String(r.id);
      const record={id,name:display|| (t?"@"+t:url),tiktok:t?"https://www.tiktok.com/@"+t:null,
        tiktok_handle:t||null,youtube:y?url:null,workflow_status:"research"};
      if(!data.confirm) {result.inserted++;continue;}
      const {error}=await context.supabase.from("creators").insert(record as never);
      if(error){
        // A deterministic ID may already have been inserted before a browser interruption.
        const {data:already,error:checkError}=await context.supabase.from("creators").select("id").eq("id",id).maybeSingle();
        if(!checkError&&already){result.existing++;continue;}
        result.errors.push(id+": "+error.message);break;
      }
      result.inserted++;
      if(t)existingT.add(t);
      if(y)existingY.add(y);
      if(normalizedName)existingNames.add(normalizedName);
    }
    return result;
  });
