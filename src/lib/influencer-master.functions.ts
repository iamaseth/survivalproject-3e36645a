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
    const completedUrls = new Set((batch ?? []).map(c => (c.tiktok || "").trim().toLowerCase().replace(/\/$/, "")).filter(Boolean));
    const { data: queueMatches, error: matchError } = await context.supabase.from("influencer_bobo_research_queue")
      .select("profile_url").in("profile_url", (batch ?? []).map(c => c.tiktok).filter(Boolean));
    if (matchError) throw new Error(matchError.message);
    const completedInQueue = (queueMatches ?? []).filter(r => completedUrls.has((r.profile_url || "").trim().toLowerCase().replace(/\/$/, ""))).length;
    // A single mutually-exclusive workflow count from the full master inventory.
    const workflowStatuses = ["research", "ai_screened", "approved", "sent", "second_look", "rejected"] as const;
    const workflowPairs = await Promise.all(workflowStatuses.map(async status => {
      const { count, error } = await context.supabase.from("influencer_workflow")
        .select("source_id", { count: "exact", head: true }).eq("workflow_status", status);
      if (error) throw new Error(error.message);
      return [status, count ?? 0] as const;
    }));
    const workflowCounts = Object.fromEntries(workflowPairs) as Record<(typeof workflowStatuses)[number], number>;
    return { sources, workflowCounts, total: Object.values(workflowCounts).reduce((a, b) => a + b, 0),
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

export const listBatchOneResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("creators")
      .select("id,name,tiktok,youtube,instagram,facebook,email,contact_route,followers_signal,segment,target_audience,other_platform,personalized_dm,qualification_status,seth_approval_status,outreach_second_look_at,verification_evidence")
      .like("id", "bobo-md-20261010-%").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveInfluencerDmDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; dm: string }) => data)
  .handler(async ({ context, data }) => {
    if (!/^bobo-md-20261010-[a-z0-9_]+$/.test(data.id)) throw new Error("Invalid creator");
    const dm = data.dm.trim();
    if (!dm || dm.length > 5000) throw new Error("Draft must be 1–5000 characters");
    const { data: saved, error } = await context.supabase.from("creators")
      .update({ personalized_dm: dm })
      .eq("id", data.id)
      .select("id,personalized_dm").single();
    if (error) throw new Error(error.message);
    return saved;
  });


/** Move an unapproved AI-screened creator to manual Second Look. */
export const moveAiScreenedToSecondLook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => { if (!data?.id) throw new Error("Missing creator ID"); return data; })
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc("ai_screened_second_look" as never, { p_id: data.id } as never);
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });

/** Page the same master workflow view used for homepage counters. */
export const listWorkflowSection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status: "research"|"ai_screened"|"approved"|"sent"|"second_look"|"rejected"; page?: number }) => data)
  .handler(async ({ context, data }) => {
    const page = Math.max(0, Math.floor(data.page ?? 0));
    const { data: rows, count, error } = await context.supabase.from("influencer_workflow")
      .select("source_table,source_id,display_name,tiktok_url,youtube_url,instagram_url,facebook_url,workflow_status", { count: "exact" })
      .eq("workflow_status", data.status)
      .order("source_table").order("source_id")
      .range(page * 100, page * 100 + 99);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0, page };
  });

/** Set the single authoritative workflow status after an explicit manual review. */
export const setInfluencerWorkflowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "approved"|"second_look"|"rejected" }) => {
    if (!data?.id || !["approved","second_look","rejected"].includes(data.status)) throw new Error("Invalid decision");
    return data;
  })
  .handler(async ({ context, data }) => {
    const approval = data.status === "approved" ? "approved" : data.status === "rejected" ? "rejected" : null;
    const update = approval ? { workflow_status: data.status, seth_approval_status: approval } : { workflow_status: data.status };
    const { data: saved, error } = await context.supabase.from("creators")
      .update(update).eq("id", data.id).select("id,workflow_status").single();
    if (error) throw new Error(error.message);
    if (saved.workflow_status !== data.status) throw new Error("Decision was not saved");
    return { ok: true, status: saved.workflow_status };
  });
