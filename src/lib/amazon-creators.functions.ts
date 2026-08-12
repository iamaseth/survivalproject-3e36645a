import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AmazonCreatorInput = {
  id?: string | null;
  name: string;
  amazon_storefront_url?: string | null;
  amazon_video_url?: string | null;
  amazon_discovery_source?: string | null;
  amazon_reviewed_survival_tabs?: boolean | null;
  amazon_shoppable_video?: boolean | null;
  amazon_fit_score?: number | null;
  amazon_content_analysis?: string | null;
  segment?: string | null;
  reach_signal?: string | null;
  email?: string | null;
  contact_route?: string | null;
  youtube?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
};

function clean(value: string | null | undefined) {
  const v = value?.trim();
  return v ? v : null;
}

function derivedId(name: string, videoUrl: string | null, storefrontUrl: string | null) {
  const source = videoUrl || storefrontUrl || name;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `AMZ-${Math.abs(hash >>> 0).toString(36).toUpperCase()}`;
}

export const listAmazonCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("creators")
      .select("*")
      .or("amazon.eq.Yes,amazon.eq.yes,amazon_storefront_url.not.is.null,amazon_video_url.not.is.null,amazon_shoppable_video.eq.true,amazon_reviewed_survival_tabs.eq.true")
      .order("amazon_fit_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const addAmazonCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AmazonCreatorInput) => {
    if (!data?.name?.trim()) throw new Error("Creator name is required.");
    const score = data.amazon_fit_score;
    if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      throw new Error("Fit score must be between 0 and 100.");
    }
    if (!clean(data.amazon_video_url) && !clean(data.amazon_storefront_url)) {
      throw new Error("Add an Amazon video or storefront URL so we can deduplicate the creator.");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const videoUrl = clean(data.amazon_video_url);
    const storefrontUrl = clean(data.amazon_storefront_url);

    const dedupe: string[] = [];
    if (videoUrl) dedupe.push(`amazon_video_url.eq.${videoUrl}`);
    if (storefrontUrl) dedupe.push(`amazon_storefront_url.eq.${storefrontUrl}`);

    if (dedupe.length) {
      const { data: existing, error: existingError } = await context.supabase
        .from("creators")
        .select("id,name")
        .or(dedupe.join(","))
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (existing) return { id: existing.id as string, created: false, name: existing.name as string };
    }

    const id = clean(data.id) ?? derivedId(data.name, videoUrl, storefrontUrl);
    const row = {
      id,
      name: data.name.trim(),
      primary_source: "Amazon",
      primary_platforms: "Amazon",
      amazon: "Yes",
      amazon_storefront_url: storefrontUrl,
      amazon_video_url: videoUrl,
      amazon_discovery_source: clean(data.amazon_discovery_source) ?? "Amazon discovery",
      amazon_reviewed_survival_tabs: data.amazon_reviewed_survival_tabs ?? false,
      amazon_shoppable_video: data.amazon_shoppable_video ?? true,
      amazon_fit_score: data.amazon_fit_score ?? null,
      amazon_content_analysis: clean(data.amazon_content_analysis),
      segment: clean(data.segment),
      reach_signal: clean(data.reach_signal),
      email: clean(data.email),
      contact_route: clean(data.contact_route),
      youtube: clean(data.youtube),
      instagram: clean(data.instagram),
      tiktok: clean(data.tiktok),
      research_status: "Amazon discovery",
      research_notes: clean(data.amazon_content_analysis),
      imported_by: context.userId,
      last_researched: new Date().toISOString().slice(0, 10),
    };

    const { error } = await context.supabase.from("creators").insert(row as never);
    if (error) throw new Error(error.message);
    return { id, created: true, name: row.name };
  });

export const updateAmazonCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; patch: Partial<AmazonCreatorInput> }) => {
    if (!data?.id) throw new Error("Creator id is required.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    const p = data.patch;
    if (p.name !== undefined) patch.name = p.name.trim();
    if (p.amazon_storefront_url !== undefined) patch.amazon_storefront_url = clean(p.amazon_storefront_url);
    if (p.amazon_video_url !== undefined) patch.amazon_video_url = clean(p.amazon_video_url);
    if (p.amazon_discovery_source !== undefined) patch.amazon_discovery_source = clean(p.amazon_discovery_source);
    if (p.amazon_reviewed_survival_tabs !== undefined) patch.amazon_reviewed_survival_tabs = p.amazon_reviewed_survival_tabs;
    if (p.amazon_shoppable_video !== undefined) patch.amazon_shoppable_video = p.amazon_shoppable_video;
    if (p.amazon_fit_score !== undefined) patch.amazon_fit_score = p.amazon_fit_score;
    if (p.amazon_content_analysis !== undefined) {
      patch.amazon_content_analysis = clean(p.amazon_content_analysis);
      patch.research_notes = clean(p.amazon_content_analysis);
    }
    if (p.segment !== undefined) patch.segment = clean(p.segment);
    if (p.reach_signal !== undefined) patch.reach_signal = clean(p.reach_signal);
    if (p.email !== undefined) patch.email = clean(p.email);
    if (p.contact_route !== undefined) patch.contact_route = clean(p.contact_route);
    if (p.youtube !== undefined) patch.youtube = clean(p.youtube);
    if (p.instagram !== undefined) patch.instagram = clean(p.instagram);
    if (p.tiktok !== undefined) patch.tiktok = clean(p.tiktok);
    patch.last_researched = new Date().toISOString().slice(0, 10);

    const { error } = await context.supabase.from("creators").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { updated: true };
  });
