import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ResearchRow = Record<string, string>;
const HANDLE = /^[a-z0-9._]{2,30}$/;
// One authoritative workflow status. Only advance untouched research-stage creators from explicit AI screening.
const NON_RESEARCH = new Set([
  "id", "workflow_status", "created_at", "updated_at", "imported_by",
  "match_tiktok_handle", "match_tiktok_url", "upload_action",
  "seth_approval_status", "seth_approved_by", "seth_approved_at", "seth_approval_note",
  "seth_approval_history", "qualification_status", "outreach_owner", "outreach_assignee",
  "outreach_claimed_at", "outreach_sent_by", "outreach_sent_at", "outreach_prev",
  "outreach_second_look_at", "contacted_date", "contact_method", "response_followup",
  "sample_status", "rena_notes", "personalized_email_subject",
  "personalized_email_body", "personalization_status", "seth_next_action", "perry_comments"
]);
const JSON_FIELDS = new Set([
  "platform_profiles","platform_metrics","audience_demographics","content_categories",
  "recent_videos","recent_posts","hashtags","brand_mentions","sponsorship_evidence",
  "affiliate_links","content_samples","research_sources","raw_capture_history",
  "ai_evidence","ai_review_history","record_provenance","custom_attributes",
  "legacy_status_archive","qualification_reset_history" ,
  "tagged_accounts","video_captions_full",
  "video_thumbnails","video_raw_labels","content_links","seth_approval_history"
]);
const INTEGER_FIELDS = new Set([
  "subscriber_count","tiktok_followers","tiktok_following","tiktok_likes",
  "tiktok_video_count","tiktok_caption_count","tiktok_caption_only_count"
]);
const BOOLEAN_FIELDS = new Set(["amazon_reviewed_survival_tabs","amazon_shoppable_video"]);
function convertField(key: string, value: string): unknown {
  if (JSON_FIELDS.has(key)) {
    try { return JSON.parse(value); } catch { throw new Error("Invalid JSON in " + key); }
  }
  if (INTEGER_FIELDS.has(key)) {
    const n = Number(value.replace(/,/g, ""));
    if (!Number.isSafeInteger(n)) throw new Error("Invalid integer in " + key);
    return n;
  }
  if (BOOLEAN_FIELDS.has(key)) {
    if (/^(true|1|yes)$/i.test(value)) return true;
    if (/^(false|0|no)$/i.test(value)) return false;
    throw new Error("Invalid boolean in " + key);
  }
  return value;
}
const normalizeHandle = (raw: string) => {
  const text = (raw || "").trim().toLowerCase();
  const handle = text.includes("tiktok.com/") ? text.match(/tiktok\.com\/@([a-z0-9._]+)/)?.[1] : text.replace(/^@/, "");
  return handle && HANDLE.test(handle) ? handle : "";
};
const empty = (value: unknown) => value === null || value === undefined || value === "";
// CSV decisions are not user approvals. Incomplete captures remain in research for recapture.
function screeningDestination(value: unknown): "ai_screened" | "rejected" | null {
  const decision = String(value ?? "").trim().toUpperCase();
  if (["PASSED INITIAL SCREENING", "PASS", "A"].includes(decision)) return "ai_screened";
  if (["REJECT", "REJECTED", "C"].includes(decision)) return "rejected";
  return null;
}
function manualOrContacted(record: Record<string, unknown>): boolean {
  return ["seth_approval_status", "seth_approved_at", "qualification_status",
    "outreach_sent_at", "contacted_date", "outreach_claimed_at"]
    .some(key => !empty(record[key]));
}
function prepare(input: ResearchRow) {
  const handle = normalizeHandle(input.tiktok_handle || input.match_tiktok_handle || input.match_tiktok_url || input.tiktok);
  if (!handle) throw new Error("Invalid TikTok handle");
  const profile = "https://www.tiktok.com/@" + handle;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || NON_RESEARCH.has(key)) continue;
    if (typeof value === "string" && value.trim() !== "") safe[key] = convertField(key, value);
  }
  // A research DM may fill an empty draft, but never replace an existing or manually edited draft.
  safe.tiktok_handle = handle;
  safe.tiktok = profile;
  if (!safe.name) safe.name = "@" + handle;
  return { handle, safe };
}
export const importCreatorResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: ResearchRow[]; confirm: boolean }) => {
    if (!input || !Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 500)
      throw new Error("Select a CSV containing 1–500 creator records");
    if (typeof input.confirm !== "boolean") throw new Error("Confirmation required");
    return input;
  })
  .handler(async ({ context, data }) => {
    // Preflight: check every incoming research column exists in the live table.
    // A missing column stops the entire batch before any inserts or updates.
    const incomingColumns = [...new Set(data.rows.flatMap(row => Object.keys(row)))]
      .filter(key => /^[a-z][a-z0-9_]*$/.test(key) && !NON_RESEARCH.has(key));
    if (!incomingColumns.includes("tiktok_handle")) {
      throw new Error("The CSV must include tiktok_handle");
    }
    const { error: schemaError } = await context.supabase.from("creators")
      .select(incomingColumns.join(",")).limit(0);
    if (schemaError) throw new Error("Import blocked: live creators schema does not match CSV: " + schemaError.message);
    const seen = new Set<string>();
    const prepared = data.rows.map((row, index) => {
      try {
        const result = prepare(row);
        if (seen.has(result.handle)) throw new Error("Duplicate handle in file");
        seen.add(result.handle);
        return { ...result, index };
      } catch (error) {
        return { handle: "", safe: {}, index, error: String(error) };
      }
    });
    // Read-only lookup before every write. Preserve the one status field.
    const handles = [...new Set(prepared.filter(row => row.handle).map(row => row.handle))];
    const existing = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < handles.length; i += 50) {
      const slice = handles.slice(i, i + 50);
      const { data: found, error } = await context.supabase.from("creators")
        .select("*").in("tiktok_handle", slice);
      if (error) throw new Error("Preflight lookup failed: " + error.message);
      for (const record of found ?? []) {
        const handle = normalizeHandle(String(record.tiktok_handle || ""));
        if (handle) existing.set(handle, record as Record<string, unknown>);
      }
    }
    // Legacy URLs may exist without tiktok_handle: protect those too.
    const urls = handles.filter(handle => !existing.has(handle)).map(handle => "https://www.tiktok.com/@" + handle);
    for (let i = 0; i < urls.length; i += 50) {
      const { data: found, error } = await context.supabase.from("creators")
        .select("*").in("tiktok", urls.slice(i, i + 50));
      if (error) throw new Error("Legacy profile lookup failed: " + error.message);
      for (const record of found ?? []) {
        const handle = normalizeHandle(String(record.tiktok || ""));
        if (handle) existing.set(handle, record as Record<string, unknown>);
      }
    }
    // Stop before any writes if an invalid row would otherwise cause a partial import.
    const invalid = prepared.filter(row => !row.handle);
    if (data.confirm && invalid.length) throw new Error("Import blocked: " + invalid.length + " invalid or duplicate handles in CSV");
    const summary = { total: prepared.length, new: 0, existing: 0, inserted: 0, updated: 0,
      skipped: 0, failed: 0, statusMoved: 0, statusProtected: 0, recommendationConflicts: 0,
      errors: [] as string[] };
    for (const row of prepared) {
      if (!row.handle) { summary.failed++; summary.errors.push("Row " + (row.index + 2) + ": " + ("error" in row ? row.error : "Invalid handle")); continue; }
      const previous = existing.get(row.handle);
      if (previous) summary.existing++; else summary.new++;
      if (!data.confirm) continue;
      if (previous) {
        const incomingDecision = row.safe.ai_recommendation;
        const existingDecision = previous.ai_recommendation;
        const conflict = !empty(incomingDecision) && !empty(existingDecision) &&
          String(incomingDecision).trim().toUpperCase() !== String(existingDecision).trim().toUpperCase();
        if (conflict) {
          summary.recommendationConflicts++;
          summary.errors.push("@" + row.handle + ": existing AI recommendation differs; preserved existing decision and workflow status");
        }
        // Existing nonempty fields (including manually edited DMs) are never overwritten.
        // Do not fill screening recommendations on creators already manually reviewed or contacted.
        const protectedRecord = String(previous.workflow_status ?? "") !== "research" || manualOrContacted(previous);
        const patch = Object.fromEntries(Object.entries(row.safe).filter(([key, value]) =>
          key !== "name" && empty(previous[key]) && !empty(value) &&
          !(protectedRecord && ["ai_recommendation", "ai_reasoning", "ai_evidence", "personalized_dm"].includes(key))));
        const destination = screeningDestination(incomingDecision);
        const mayAdvance = !protectedRecord && !conflict && destination !== null &&
          (empty(existingDecision) || screeningDestination(existingDecision) === destination);
        if (protectedRecord && destination) summary.statusProtected++;
        if (Object.keys(patch).length) {
          // Guard against concurrent manual reviews: update only records still in their original stage.
          let update = context.supabase.from("creators").update(patch as never)
            .eq("id", String(previous.id)).eq("workflow_status", String(previous.workflow_status));
          if (empty(previous.seth_approval_status)) update = update.is("seth_approval_status", null);
          if (empty(previous.qualification_status)) update = update.is("qualification_status", null);
          const { data: changed, error } = await update.select("id");
          if (error) { summary.failed++; summary.errors.push("@" + row.handle + ": " + error.message); continue; }
          if (!changed?.length) {
            summary.skipped++;
            summary.errors.push("@" + row.handle + ": changed concurrently; skipped for safety");
            continue;
          }
          summary.updated++;
        }
        if (mayAdvance) {
          // Separate guarded status update after research enrichment; never move a manual decision.
          const { data: moved, error } = await context.supabase.from("creators")
            .update({ workflow_status: destination })
            .eq("id", String(previous.id)).eq("workflow_status", "research")
            .is("seth_approval_status", null).is("qualification_status", null)
            .is("outreach_sent_at", null).is("contacted_date", null)
            .select("id");
          if (error) { summary.failed++; summary.errors.push("@" + row.handle + " status: " + error.message); }
          else if (moved?.length) summary.statusMoved++;
          else summary.statusProtected++;
        } else if (!Object.keys(patch).length) summary.skipped++;
      } else {
        const id = "BOBO-RESEARCH-" + row.handle.replace(/[^a-z0-9]/g, "-");
        const record = { ...row.safe, id, workflow_status: screeningDestination(row.safe.ai_recommendation) ?? "research", imported_by: context.userId };
        const { error } = await context.supabase.from("creators").insert(record as never);
        if (error) { summary.failed++; summary.errors.push("@" + row.handle + ": " + error.message); }
        else { summary.inserted++; if (screeningDestination(row.safe.ai_recommendation)) summary.statusMoved++; }
      }
    }
    return summary;
  });
