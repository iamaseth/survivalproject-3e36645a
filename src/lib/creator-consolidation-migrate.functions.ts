import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Additive migration only. Source staging rows remain untouched.
const normalize = (raw: string) => {
  const value = (raw || "").trim().toLowerCase();
  const handle = value.match(/tiktok\.com\/@([a-z0-9._]+)/)?.[1] || value.replace(/^@/, "");
  return /^[a-z0-9._]{2,30}$/.test(handle) ? handle : "";
};
export const migrateStagedResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { confirm: boolean; offset: number; limit?: number }) => {
    if (typeof data?.confirm !== "boolean" || !Number.isInteger(data.offset) || data.offset < 0)
      throw new Error("Invalid migration request");
    if (data.limit !== undefined && (!Number.isInteger(data.limit) || data.limit < 1 || data.limit > 100))
      throw new Error("Batch size must be 1–100");
    return data;
  })
  .handler(async ({ context, data }) => {
    const limit = data.limit ?? 50;
    const { data: staged, error: stageError } = await context.supabase
      .from("influencer_research_staging")
      .select("id,handle,profile_url,md_content,evidence,source")
      .order("id").range(data.offset, data.offset + limit - 1);
    if (stageError) throw new Error(stageError.message);
    const records = staged ?? [];
    const handles = records.map(row => normalize(row.handle || row.profile_url));
    if (handles.some(handle => !handle)) throw new Error("Migration stopped: staging contains an invalid handle in this batch");
    if (new Set(handles).size !== handles.length) throw new Error("Migration stopped: duplicate handles in this batch");

    // Match BOTH canonical handle and existing TikTok URLs before inserting.
    const { data: master, error: masterError } = await context.supabase.from("creators")
      .select("id,tiktok,tiktok_handle,research_notes,workflow_status")
      .or(handles.map(handle => "tiktok_handle.eq." + handle).concat(handles.map(handle => "tiktok.eq.https://www.tiktok.com/@" + handle)).join(","));
    if (masterError) throw new Error("Master lookup failed: " + masterError.message);
    const existing = new Map<string, (typeof master)[number]>();
    for (const creator of master ?? []) {
      const key = normalize(creator.tiktok_handle || creator.tiktok || "");
      if (key) existing.set(key, creator);
    }
    const summary = { offset: data.offset, scanned: records.length, new: 0, existing: 0, inserted: 0, updated: 0, skipped: 0, errors: [] as string[], dryRun: !data.confirm };
    for (let i = 0; i < records.length; i++) {
      const row = records[i], handle = handles[i], previous = existing.get(handle);
      const research = [row.md_content || "", row.evidence ? "Research evidence:\n" + JSON.stringify(row.evidence) : ""].filter(Boolean).join("\n\n");
      if (previous) {
        summary.existing++;
        if (!research || previous.research_notes) { summary.skipped++; continue; }
        if (!data.confirm) continue;
        const { error } = await context.supabase.from("creators").update({ research_notes: research }).eq("id", previous.id).is("research_notes", null);
        if (error) summary.errors.push("@" + handle + ": " + error.message);
        else summary.updated++;
      } else {
        summary.new++;
        if (!data.confirm) continue;
        const record = { id: "STAGED-TIKTOK-" + row.id, name: "@" + handle,
          tiktok: "https://www.tiktok.com/@" + handle, tiktok_handle: handle,
          workflow_status: "research", research_notes: research || null };
        const { error } = await context.supabase.from("creators").insert(record as never);
        if (error) summary.errors.push("@" + handle + ": " + error.message);
        else summary.inserted++;
      }
    }
    return summary;
  });
