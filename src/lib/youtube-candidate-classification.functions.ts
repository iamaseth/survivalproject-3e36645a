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
 * Applies classifications in one server request.
 * Important: these rows already exist. Use UPDATE, not UPSERT/INSERT, so RLS only
 * needs the same update permission used by the working single-row classifier.
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

    let classified = 0;
    for (const raw of currentRows ?? []) {
      const current = raw as unknown as {
        id: string;
        external_links?: Array<Record<string, string | null>> | null;
      };
      const classification = requested.get(current.id);
      if (!classification) continue;
      const existing = Array.isArray(current.external_links) ? current.external_links : [];

      const { error: writeErr } = await context.supabase
        .from("youtube_candidates")
        .update({ external_links: withClassification(existing, classification) } as never)
        .eq("id", current.id);
      if (writeErr) throw new Error(writeErr.message);
      classified += 1;
    }

    return {
      received: data.rows.length,
      classified,
      missing: data.rows.length - classified,
    };
  });
