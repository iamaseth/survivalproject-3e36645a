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
 const {data:master,error}=await context.supabase.from("creators").select("id,name,youtube").order("id").limit(20000);
 if(error)throw new Error(error.message);
 const exact=new Set((master||[]).map(x=>idFrom(x.youtube||"")).filter(Boolean));
 const names=new Set((master||[]).map(x=>norm(x.name||"")).filter(Boolean));
 const slice=youtubeDiscoveryRows.slice(data.offset,data.offset+50);
 const result={total:youtubeDiscoveryRows.length,offset:data.offset,scanned:slice.length,existing:0,possibleNameMatches:0,missing:0,inserted:0,errors:[] as string[],dryRun:!data.confirm};
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
