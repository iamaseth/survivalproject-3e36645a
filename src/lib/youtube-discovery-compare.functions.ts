import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { youtubeDiscoveryRows } from "./youtube-discovery-source";

const idFrom=(url:string)=>url.match(/youtube\.com\/channel\/(UC[\w-]+)/i)?.[1]?.toLowerCase()||"";
const norm=(s:string)=>s.toLowerCase().trim().replace(/\s+/g," ");
export const compareYoutubeDiscovery=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((d:{confirm:boolean;offset:number})=>{
 if(typeof d?.confirm!=="boolean"||!Number.isInteger(d.offset)||d.offset<0||d.offset>=youtubeDiscoveryRows.length)throw new Error("Invalid comparison");
 return d;
})
.handler(async ({context,data})=>{
 // PostgREST often caps a response at 1,000 rows even when .limit(20000) is requested.
 // Read every page: newly imported YT-API IDs sort after the first page.
 const master: Array<{id:string;name:string|null;youtube:string|null}> = [];
 for(let start=0;start<50000;start+=500){
  const {data:page,error}=await context.supabase.from("creators")
    .select("id,name,youtube").order("id").range(start,start+499);
  if(error)throw new Error("Master lookup failed at "+start+": "+error.message);
  master.push(...(page||[]));
  if((page||[]).length<500)break;
 }
 const exact=new Set(master.map(x=>idFrom(x.youtube||"")).filter(Boolean));
 const names=new Set(master.map(x=>norm(x.name||"")).filter(Boolean));
 const slice=youtubeDiscoveryRows.slice(data.offset,data.offset+50);
 const result={total:youtubeDiscoveryRows.length,offset:data.offset,scanned:slice.length,existing:0,possibleNameMatches:0,missing:0,inserted:0,errors:[] as string[],dryRun:!data.confirm,masterRowsChecked:master.length};
 for(const r of slice){
  const id=r.channelId.toLowerCase(), name=norm(r.name);
  if(exact.has(id)){result.existing++;continue;}
  if(names.has(name)){result.possibleNameMatches++;continue;}
  result.missing++;
  if(!data.confirm)continue;
  const record={id:"YT-API-"+r.channelId,name:r.name,youtube:r.youtube,workflow_status:"research"};
  const {error:insertError}=await context.supabase.from("creators").insert(record as never);
  if(insertError){
    const {data:existing}=await context.supabase.from("creators").select("id").eq("id",record.id).maybeSingle();
    if(existing){result.existing++;result.missing--;continue;}
    result.errors.push(r.channelId+": "+insertError.message);break;
  }
  result.inserted++;exact.add(id);names.add(name);
 }
 return result;
});
