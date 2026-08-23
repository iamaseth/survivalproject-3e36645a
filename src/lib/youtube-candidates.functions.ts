// Review + promote server functions for the YouTube candidate staging table.
// Nothing here sends email; Keep only creates a creator record.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type YouTubeCandidate = {
  id: string;
  channel_id: string;
  channel_url: string | null;
  channel_title: string | null;
  subscriber_count: number | null;
  video_count: number | null;
  country: string | null;
  description_email: string | null;
  business_email: string | null;
  email_source: string | null;
  enrichment_status: string;
  enrichment_checked_at: string | null;
  enrichment_error: string | null;
  external_links: Array<Record<string, string | null>>;
  topic_keyword: string | null;
  last_upload_at: string | null;
  source: string | null;
  status: "pending" | "kept" | "skipped";
  email_status: string;
  promoted_creator_id: string | null;
  created_at: string;
};

export const listYouTubeCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("youtube_candidates")
      .select("*")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as YouTubeCandidate[];
  });

export const listYouTubeEnrichmentQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("youtube_candidates")
      .select("*")
      .eq("status", "pending")
      .is("business_email", null)
      .is("description_email", null)
      .in("enrichment_status", ["not_started", "error"])
      .order("subscriber_count", { ascending: false, nullsFirst: false })
      .order("last_upload_at", { ascending: false, nullsFirst: false })
      .limit(250);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as YouTubeCandidate[];
  });

export const applyYouTubeEnrichmentResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    business_email?: string | null;
    email_source?: string | null;
    external_links?: Array<Record<string, string | null>>;
    status: "found" | "no_email_found" | "error";
    error?: string | null;
  }) => {
    if (!data?.id) throw new Error("id required");
    if (!data?.status) throw new Error("status required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const email = data.business_email?.trim().toLowerCase() || null;
    const { error } = await context.supabase
      .from("youtube_candidates")
      .update({
        business_email: email,
        email_status: email ? "found" : data.status === "error" ? "error" : "none",
        email_source: data.email_source ?? null,
        external_links: data.external_links ?? [],
        enrichment_status: data.status,
        enrichment_checked_at: new Date().toISOString(),
        enrichment_error: data.status === "error" ? data.error ?? "Unknown enrichment error" : null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const skipYouTubeCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("youtube_candidates")
      .update({
        status: "skipped",
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Keep = promote into public.creators with dedup, then record promoted_creator_id. */
export const keepYouTubeCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; owner?: string | null }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: cand, error: cErr } = await context.supabase
      .from("youtube_candidates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cand) throw new Error("Candidate not found");

    const c = cand as unknown as YouTubeCandidate;
    const email = (c.business_email || c.description_email || "").toLowerCase() || null;

    let creatorId: string | null = null;
    const { data: byChannel } = await context.supabase
      .from("creators")
      .select("id")
      .eq("youtube_channel_id", c.channel_id)
      .limit(1)
      .maybeSingle();
    if (byChannel) creatorId = (byChannel as { id: string }).id;
    if (!creatorId && email) {
      const { data: byEmail } = await context.supabase
        .from("creators")
        .select("id")
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (byEmail) creatorId = (byEmail as { id: string }).id;
    }

    let created = false;
    if (!creatorId) {
      creatorId = `YT-${c.channel_id.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`;
      const insertRow = {
        id: creatorId,
        name: c.channel_title || c.channel_id,
        segment: c.topic_keyword ?? null,
        primary_platforms: "YouTube",
        primary_source: "YouTube discovery",
        reach_signal: c.subscriber_count != null ? `${c.subscriber_count} subscribers` : null,
        subscriber_count: c.subscriber_count ?? null,
        youtube: c.channel_url ?? `https://www.youtube.com/channel/${c.channel_id}`,
        youtube_channel_id: c.channel_id,
        email,
        contact_route: email ? c.email_source || "Public channel email" : null,
        contact_confidence: email ? "Medium" : null,
        research_status: "Imported — needs review",
        priority: null,
        outreach_owner: data.owner ?? null,
        last_researched: new Date().toISOString().slice(0, 10),
        imported_by: context.userId,
      };
      const { error: insErr } = await context.supabase
        .from("creators")
        .upsert(insertRow as never, { onConflict: "id", ignoreDuplicates: true });
      if (insErr) throw new Error(insErr.message);
      created = true;
    }

    const { error: upErr } = await context.supabase
      .from("youtube_candidates")
      .update({
        status: "kept",
        promoted_creator_id: creatorId,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      } as never)
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { creatorId, created };
  });

export type PipelineCounts = {
  liveCreators: number;
  under20k: number;
  withEmail: number;
  missingEmail: number;
  pendingCandidates: number;
  enrichmentPending: number;
  usableEmails: number;
  goal: number;
};

/** Compact progress counters. `usableEmails` counts unique addresses, not rows. */
export const getPipelineCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PipelineCounts> => {
    const { data: creators, error } = await context.supabase
      .from("creators")
      .select("id, email, subscriber_count")
      .limit(20000);
    if (error) throw new Error(error.message);
    const rows = (creators ?? []) as unknown as Array<{
      id: string;
      email: string | null;
      subscriber_count: number | null;
    }>;

    const { data: dnc } = await context.supabase
      .from("creator_workspace")
      .select("creator_id")
      .eq("do_not_contact", true);
    const dncIds = new Set((dnc ?? []).map((r) => (r as { creator_id: string }).creator_id));

    const usable = new Set<string>();
    let withEmail = 0;
    let under20k = 0;
    for (const r of rows) {
      const e = (r.email ?? "").trim().toLowerCase();
      if (e && e.includes("@")) {
        withEmail++;
        if (!dncIds.has(r.id)) usable.add(e);
      }
      if (r.subscriber_count != null && r.subscriber_count <= 20000) under20k++;
    }

    const { count: pending } = await context.supabase
      .from("youtube_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: enrichmentPending } = await context.supabase
      .from("youtube_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("business_email", null)
      .is("description_email", null)
      .in("enrichment_status", ["not_started", "error"]);

    return {
      liveCreators: rows.length,
      under20k,
      withEmail,
      missingEmail: rows.length - withEmail,
      pendingCandidates: pending ?? 0,
      enrichmentPending: enrichmentPending ?? 0,
      usableEmails: usable.size,
      goal: 1000,
    };
  });
