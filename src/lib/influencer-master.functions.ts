import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Source records are immutable in this workflow. All enrichment is additive.
export const getInfluencerMasterCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tables = ["creators", "creators_archive", "reviewed_creators", "youtube_candidates", "influencer_research_staging"] as const;
    const entries = await Promise.all(tables.map(async table => {
      const { count, error } = await context.supabase.from(table).select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return [table, count ?? 0] as const;
    }));
    const sources = Object.fromEntries(entries) as Record<string, number>;
    const { count: boboQueueCount, error: queueError } = await context.supabase.from("influencer_bobo_research_queue").select("*", { count: "exact", head: true });
    if (queueError) throw new Error(queueError.message);
    return { sources, total: Object.values(sources).reduce((a, b) => a + b, 0), boboQueueCount: boboQueueCount ?? 0 };
  });

export const listInfluencerOriginals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { page?: number; source?: string }) => data ?? {})
  .handler(async ({ context, data }) => {
    const page = Math.max(0, Math.floor(data.page ?? 0));
    let query = context.supabase.from("influencer_original_master")
      .select("source_table,source_id,display_name,tiktok_url,youtube_url,instagram_url,facebook_url,original_data", { count: "exact" });
    if (data.source) query = query.eq("source_table", data.source);
    const { data: rows, count, error } = await query.order("source_table").order("source_id").range(page * 100, page * 100 + 99);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page };
  });

export const listBoboResearchQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { page?: number }) => data ?? {})
  .handler(async ({ context, data }) => {
    const page = Math.max(0, Math.floor(data.page ?? 0));
    const { data: rows, count, error } = await context.supabase.from("influencer_bobo_research_queue")
      .select("source_table,source_id,display_name,profile_url,stage", { count: "exact" })
      .order("source_table").order("source_id").range(page * 100, page * 100 + 99);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page };
  });
