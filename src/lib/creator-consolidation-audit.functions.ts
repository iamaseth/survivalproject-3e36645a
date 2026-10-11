import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Read-only migration audit. Never writes, deletes or changes creator status.
const sources = ["creators", "creators_archive", "reviewed_creators", "youtube_candidates", "influencer_research_staging"] as const;
const keyFor = (row: Record<string, unknown>) => {
  const raw = String(row.tiktok_handle || row.handle || row.tiktok || row.profile_url || "").trim().toLowerCase();
  const match = raw.match(/tiktok\.com\/@([a-z0-9._]+)/);
  return match ? match[1] : (/^@?[a-z0-9._]{2,30}$/.test(raw) ? raw.replace(/^@/, "") : "");
};
export const auditCreatorConsolidation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const report: Array<{ table: string; rows: number; scanned: number; handles: number; missingHandle: number; duplicateWithin: number; alreadyInMaster: number; newHandles: number; incomplete: boolean; error?: string }> = [];
    const master = new Set<string>();
    const sourceKeys: Array<{table:string; keys:Set<string>}> = [];
    for (const table of sources) {
      const { count, error: countError } = await context.supabase.from(table).select("*", { count: "exact", head: true });
      if (countError) { report.push({table,rows:0,scanned:0,handles:0,missingHandle:0,duplicateWithin:0,alreadyInMaster:0,newHandles:0,incomplete:true,error:countError.message}); continue; }
      const keys = new Set<string>();
      let scanned = 0, missingHandle = 0, duplicateWithin = 0, error = "";
      const maxRows = 20000;
      for (let offset = 0; offset < Math.min(count ?? 0, maxRows); offset += 500) {
        const { data, error: pageError } = await context.supabase.from(table).select("*").range(offset, offset + 499);
        if (pageError) { error = pageError.message; break; }
        for (const raw of data ?? []) {
          scanned++;
          const handle = keyFor(raw as Record<string, unknown>);
          if (!handle) { missingHandle++; continue; }
          if (keys.has(handle)) duplicateWithin++;
          keys.add(handle);
        }
      }
      sourceKeys.push({table,keys});
      if (table === "creators") for (const key of keys) master.add(key);
      report.push({table,rows:count ?? 0,scanned,handles:keys.size,missingHandle,duplicateWithin,alreadyInMaster:0,newHandles:0,incomplete:!!error || scanned !== (count ?? 0),...(error?{error}:{})});
    }
    for (const row of report) {
      const keys = sourceKeys.find(item => item.table === row.table)?.keys;
      if (!keys) continue;
      row.alreadyInMaster = [...keys].filter(key => master.has(key)).length;
      row.newHandles = [...keys].filter(key => !master.has(key)).length;
    }
    return {readOnly:true,masterUniqueHandles:master.size,report,readyForMigration:false};
  });
