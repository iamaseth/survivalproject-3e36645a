import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Accept profile and video URLs; save only canonical creator profiles.
export const saveBoboTikTokProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { url: string; keyword: string }) => data)
  .handler(async ({ data, context }) => {
    const raw = data.url.trim();
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new Error("Paste the creator's TikTok profile link."); }
    if (!["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(parsed.hostname.toLowerCase())) {
      throw new Error("Please paste a TikTok profile link.");
    }
    const match = parsed.pathname.match(/^\/@([A-Za-z0-9._]{2,24})(?:\/(?:video|photo)\/\d+)?\/?$/);
    if (!match) throw new Error("Open the creator's main profile and copy that link, not a video link.");
    const handle = match[1].toLowerCase();
    const canonical = `https://www.tiktok.com/@${handle}`;
    const { data: existing, error: lookupError } = await context.supabase
      .from("creators").select("id,tiktok").ilike("tiktok", `%@${handle}%`).limit(100);
    if (lookupError) throw new Error(lookupError.message);
    const duplicate = (existing ?? []).find((row) => {
      const value = String(row.tiktok ?? "");
      try { return new URL(value).pathname.toLowerCase().replace(/\/$/, "") === `/@${handle}`; }
      catch { return value.toLowerCase().replace(/\/$/, "") === canonical.toLowerCase(); }
    });
    if (duplicate) return { status: "duplicate" as const };
    const id = `TIKTOK-${handle.toUpperCase()}`;
    const { data: sameId, error: idError } = await context.supabase.from("creators").select("id").eq("id", id).maybeSingle();
    if (idError) throw new Error(idError.message);
    if (sameId) return { status: "duplicate" as const };
    const { error } = await context.supabase.from("creators").insert({
      id, name: `@${handle}`, tiktok: canonical, primary_platforms: "TikTok",
      research_notes: `BoBo TikTok search: ${data.keyword.slice(0, 100)}. Profile not yet reviewed for fit.`,
      research_status: "Needs review", imported_by: context.userId,
    } as never);
    if (error) {
      if (error.code === "23505") return { status: "duplicate" as const };
      throw new Error(error.message);
    }
    return { status: "saved" as const };
  });

type ResearchProgress = { index: number; done: number[]; saved: number; perTerm: Record<string, number>; recent: Record<string, string[]> };
const defaultProgress: ResearchProgress = { index: 0, done: [], saved: 0, perTerm: {}, recent: {} };
export const getBoboResearchProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("bobo_research_progress" as never)
      .select("*").eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { exists: false, progress: defaultProgress };
    const row = data as unknown as Record<string, any>;
    return { exists: true, progress: {
      index: row.current_index ?? 0, done: row.done_terms ?? [],
      saved: row.total_saved ?? 0, perTerm: row.per_term ?? {}, recent: row.recent ?? {},
    } as ResearchProgress };
  });
export const putBoboResearchProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ResearchProgress) => data)
  .handler(async ({ context, data }) => {
    if (!Number.isInteger(data.index) || data.index < 0 || data.index >= 50 ||
      !Array.isArray(data.done) || !data.done.every(i => Number.isInteger(i) && i >= 0 && i < 50))
      throw new Error("Invalid search progress");
    const { error } = await context.supabase.from("bobo_research_progress" as never).upsert({
      user_id: context.userId, current_index: data.index, done_terms: data.done,
      total_saved: data.saved, per_term: data.perTerm, recent: data.recent,
    } as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
