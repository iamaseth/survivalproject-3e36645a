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
    // Count the newly researched Batch 1 by its stable import ID, without touching source rows.
    const { data: batch, error: batchError } = await context.supabase.from("creators")
      .select("id,tiktok,qualification_status,seth_approval_status")
      .like("id", "bobo-md-20261010-%");
    if (batchError) throw new Error(batchError.message);
    const completedUrls = new Set((batch ?? []).map(c => (c.tiktok || "").trim().toLowerCase().replace(/\\/$/, "")).filter(Boolean));
    const { data: queueMatches, error: matchError } = await context.supabase.from("influencer_bobo_research_queue")
      .select("profile_url").in("profile_url", (batch ?? []).map(c => c.tiktok).filter(Boolean));
    if (matchError) throw new Error(matchError.message);
    const completedInQueue = (queueMatches ?? []).filter(r => completedUrls.has((r.profile_url || "").trim().toLowerCase().replace(/\\/$/, ""))).length;
    return { sources, total: Object.values(sources).reduce((a, b) => a + b, 0),
      boboQueueCount: Math.max(0, (boboQueueCount ?? 0) - completedInQueue),
      aiScreenedCount: (batch ?? []).filter(c => c.qualification_status === "Qualified" && !c.seth_approval_status).length,
      aiRejectedCount: (batch ?? []).filter(c => c.qualification_status === "Not Relevant" && !c.seth_approval_status).length };
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
