import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Json = any;

export const listReviewedCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reviewed_creators")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Array<Record<string, Json>> };
  });

export const updateReviewedCreatorWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    contacted_date?: string | null;
    contact_method?: string | null;
    response_followup?: string | null;
    sample_status?: string | null;
    rena_notes?: string | null;
  }) => {
    if (!data?.id) throw new Error("Reviewed creator id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const { error } = await context.supabase
      .from("reviewed_creators")
      .update(cleanPatch as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { updated: true };
  });
