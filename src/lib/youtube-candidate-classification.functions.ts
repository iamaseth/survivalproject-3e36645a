import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CandidateClassification =
  | "creator"
  | "brand_company"
  | "competitor"
  | "organization"
  | "needs_review";

const allowed = new Set<CandidateClassification>([
  "creator",
  "brand_company",
  "competitor",
  "organization",
  "needs_review",
]);

export const setYouTubeCandidateClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; classification: CandidateClassification }) => {
    if (!data?.id) throw new Error("id required");
    if (!allowed.has(data.classification)) throw new Error("invalid classification");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: current, error: readErr } = await context.supabase
      .from("youtube_candidates")
      .select("id,external_links")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Candidate not found");

    const existing = Array.isArray((current as { external_links?: unknown[] }).external_links)
      ? ((current as { external_links: Array<Record<string, string | null>> }).external_links)
      : [];

    const withoutClassification = existing.filter((item) => item?.kind !== "research_classification");
    const externalLinks = [
      ...withoutClassification,
      {
        kind: "research_classification",
        url: null,
        source: data.classification,
      },
    ];

    const { error: updateErr } = await context.supabase
      .from("youtube_candidates")
      .update({ external_links: externalLinks } as never)
      .eq("id", data.id);
    if (updateErr) throw new Error(updateErr.message);

    return { ok: true as const, classification: data.classification };
  });
