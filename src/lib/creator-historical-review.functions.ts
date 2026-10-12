import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Read-only source review: never changes original tables or creator approvals.
type Source = "creators_archive" | "reviewed_creators";
const sources = ["creators_archive","reviewed_creators"] as const;
type Row = Record<string,unknown>;
const value=(r:Row,fields:string[])=>fields.map(k=>typeof r[k]==="string"?String(r[k]).trim():"").find(Boolean)||"";
const normalize=(x:string)=>x.toLowerCase().replace(/\s+/g," ").trim();
export const listHistoricalReviewQueue=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .inputValidator((d:{source:Source;page:number})=>{
   if(!sources.includes(d?.source)||!Number.isInteger(d.page)||d.page<0||d.page>500)throw new Error("Invalid review page");
   return d;
 })
 .handler(async ({context,data})=>{
   const {data:records,count,error}=await context.supabase.from(data.source).select("*",{count:"exact"})
     .order("id").range(data.page*25,data.page*25+24);
   if(error)throw new Error(error.message);
   const {data:master,error:masterError}=await context.supabase.from("creators").select("id,name,tiktok,youtube").limit(20000);
   if(masterError)throw new Error(masterError.message);
   const masterNames=new Map<string,string[]>();
   for(const r of master??[]){
     const k=normalize(r.name||"");
     if(k)masterNames.set(k,[...(masterNames.get(k)||[]),r.id]);
   }
   const rows=(records??[]).map((r:Row)=>{
     const displayName=value(r,["display_name","name","creator_name","channel_name","username"]);
     const urls=["tiktok","tiktok_url","youtube","youtube_url","channel_url","profile_url","url","instagram","facebook"].map(k=>value(r,[k])).filter(Boolean);
     const candidateIds=masterNames.get(normalize(displayName))||[];
     return {id:String(r.id),name:displayName||"(unnamed)",urls:[...new Set(urls)],
       possibleNameMatches:candidateIds.slice(0,5),
       details:Object.fromEntries(Object.entries(r).filter(([k,v])=>!/(password|token|secret|credential|auth)/i.test(k)&&v!==null&&v!==undefined).slice(0,30).map(([k,v])=>[k,typeof v==="string"?v:JSON.stringify(v)??String(v)]))};
   });
   return {source:data.source,page:data.page,total:count??0,rows,readOnly:true};
 });
