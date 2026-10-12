import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Read-only inventory. Alternative identifiers are evidence, NOT automatic merge authorization.
const sources = ["creators", "creators_archive", "reviewed_creators", "youtube_candidates", "influencer_research_staging"] as const;
type Row = Record<string, unknown>;
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const first = (row: Row, fields: string[]) => fields.map(field => str(row[field])).find(Boolean) || "";
const tiktok = (row: Row) => {
  const raw = first(row, ["tiktok_handle", "handle", "tiktok", "profile_url"]).toLowerCase();
  const match = raw.match(/tiktok\.com\/@([a-z0-9._]+)/);
  return match ? match[1] : (/^@?[a-z0-9._]{2,30}$/.test(raw) ? raw.replace(/^@/, "") : "");
};
const youtube = (row: Row) => {
  const raw = first(row, ["youtube_url", "youtube", "channel_url", "url", "profile_url"]);
  const match = raw.match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:@([\w.-]+)|channel\/([\w-]+)|c\/([\w.-]+)|user\/([\w.-]+))|youtu\.be\/([\w-]+))/i);
  return match ? (match[1] ? "handle:" + match[1].toLowerCase() : match[2] ? "channel:" + match[2].toLowerCase() : match[3] ? "custom:" + match[3].toLowerCase() : match[4] ? "user:" + match[4].toLowerCase() : "video:" + match[5].toLowerCase()) : "";
};
const name = (row: Row) => first(row, ["display_name", "name", "creator_name", "channel_name", "username"]).toLowerCase().replace(/\s+/g, " ").trim();
const idFor = (row: Row) => ({tiktok:tiktok(row),youtube:youtube(row),name:name(row)});
type Keys = ReturnType<typeof idFor>;
export const auditCreatorConsolidation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const collected: Array<{table:string; rows:number; scanned:number; keys:Keys[]; error?:string}> = [];
    for (const table of sources) {
      const { count, error: countError } = await context.supabase.from(table).select("*", { count:"exact", head:true });
      if (countError) { collected.push({table,rows:0,scanned:0,keys:[],error:countError.message}); continue; }
      const keys: Keys[] = [];
      let error = "";
      for (let offset=0; offset<Math.min(count ?? 0,20000); offset+=500) {
        const {data,error:pageError} = await context.supabase.from(table).select("*").order("id").range(offset,offset+499);
        if (pageError) { error=pageError.message; break; }
        for (const item of data ?? []) keys.push(idFor(item as Row));
      }
      collected.push({table,rows:count ?? 0,scanned:keys.length,keys,...(error?{error}:{})});
    }
    const master = collected.find(item=>item.table==="creators")?.keys ?? [];
    const masterTikTok = new Set(master.map(x=>x.tiktok).filter(Boolean));
    const masterYouTube = new Set(master.map(x=>x.youtube).filter(Boolean));
    const masterNames = new Set(master.map(x=>x.name).filter(Boolean));
    const report = collected.map(item=>{
      const handles = item.keys.map(x=>x.tiktok).filter(Boolean);
      const uniqueHandles = new Set(handles);
      const youtubeKeys = new Set(item.keys.map(x=>x.youtube).filter(Boolean));
      const names = new Set(item.keys.map(x=>x.name).filter(Boolean));
      const matchesTikTok = item.keys.filter(x=>!!x.tiktok && masterTikTok.has(x.tiktok)).length;
      const matchesYouTube = item.keys.filter(x=>!!x.youtube && masterYouTube.has(x.youtube)).length;
      const matchesNameOnly = item.keys.filter(x=>!!x.name && masterNames.has(x.name) && !(x.tiktok && masterTikTok.has(x.tiktok)) && !(x.youtube && masterYouTube.has(x.youtube))).length;
      const unmatchedByStrongId = item.keys.filter(x=>!(x.tiktok && masterTikTok.has(x.tiktok)) && !(x.youtube && masterYouTube.has(x.youtube))).length;
      return {table:item.table,rows:item.rows,scanned:item.scanned,handles:uniqueHandles.size,
        missingHandle:item.scanned-handles.length,duplicateWithin:handles.length-uniqueHandles.size,
        alreadyInMaster:uniqueHandles.size ? [...uniqueHandles].filter(x=>masterTikTok.has(x)).length : 0,
        newHandles:[...uniqueHandles].filter(x=>!masterTikTok.has(x)).length,
        youtubeIdentifiers:youtubeKeys.size, matchedYouTubeRows:matchesYouTube,
        namedRows:item.keys.filter(x=>!!x.name).length, nameOnlyPossibleMatches:matchesNameOnly,
        matchedTikTokRows:matchesTikTok, unmatchedByStrongId,
        // YouTube video URLs and creator-name matches are NOT proof of identical creators.
        incomplete:!!item.error || item.scanned!==item.rows,...(item.error?{error:item.error}:{})};
    });
    return {readOnly:true,masterUniqueHandles:masterTikTok.size,report,readyForMigration:false};
  });
