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

function withClassification(
  externalLinks: Array<Record<string, string | null>>,
  classification: CandidateClassification,
) {
  const withoutClassification = externalLinks.filter((item) => item?.kind !== "research_classification");
  return [
    ...withoutClassification,
    {
      kind: "research_classification",
      url: null,
      source: classification,
    },
  ];
}

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

    const { error: updateErr } = await context.supabase
      .from("youtube_candidates")
      .update({ external_links: withClassification(existing, data.classification) } as never)
      .eq("id", data.id);
    if (updateErr) throw new Error(updateErr.message);

    return { ok: true as const, classification: data.classification };
  });

/**
 * Applies classifications to existing rows only. UPDATE is required here because
 * youtube_candidates RLS intentionally blocks inserts from this workflow.
 * Writes run in small parallel groups so imports finish quickly without flooding
 * Supabase or changing any non-classification fields.
 */
export const setYouTubeCandidateClassificationsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: Array<{ id: string; classification: CandidateClassification }> }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows required");
    if (data.rows.length > 100) throw new Error("Maximum 100 classification rows per batch");
    for (const row of data.rows) {
      if (!row?.id) throw new Error("id required");
      if (!allowed.has(row.classification)) throw new Error("invalid classification");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    if (!data.rows.length) return { received: 0, classified: 0, missing: 0 };

    const requested = new Map(data.rows.map((row) => [row.id, row.classification]));
    const ids = [...requested.keys()];
    const { data: currentRows, error: readErr } = await context.supabase
      .from("youtube_candidates")
      .select("id,external_links")
      .in("id", ids);
    if (readErr) throw new Error(readErr.message);

    const rows = (currentRows ?? []).map((raw) => {
      const current = raw as unknown as {
        id: string;
        external_links?: Array<Record<string, string | null>> | null;
      };
      return {
        id: current.id,
        classification: requested.get(current.id)!,
        externalLinks: Array.isArray(current.external_links) ? current.external_links : [],
      };
    });

    let classified = 0;
    const concurrency = 10;
    for (let start = 0; start < rows.length; start += concurrency) {
      const group = rows.slice(start, start + concurrency);
      const results = await Promise.all(group.map(async (row) => {
        const { error } = await context.supabase
          .from("youtube_candidates")
          .update({ external_links: withClassification(row.externalLinks, row.classification) } as never)
          .eq("id", row.id);
        if (error) throw new Error(error.message);
        return 1;
      }));
      classified += results.length;
    }

    return {
      received: data.rows.length,
      classified,
      missing: data.rows.length - classified,
    };
  });
