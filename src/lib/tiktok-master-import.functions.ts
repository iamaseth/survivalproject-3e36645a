// Safe, cumulative import of the TikTok qualification master CSV.
// Rules: match by normalized TikTok handle (or CRM id), only FILL empty fields,
// never downgrade/overwrite statuses, DMs, contact history or prior reviews.
// A row counts as "verified" only with an explicit verified flag + reviewer + date + 40+ chars evidence.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MasterRow = {
  line: number;
  id?: string; profile?: string; name?: string; qualification?: string; dm?: string;
  evidence?: string; reviewer?: string; reviewDate?: string; verified?: string;
  decision?: string; publicUrl?: string; method?: string; // Batch screening columns
  // 'Draft DM - Do Not Send' is intentionally never read.
};

export type RowResult = {
  line: number; handle: string | null; id: string | null; outcome:
    | "invalid" | "duplicate_in_file" | "new" | "new_skipped" | "updated" | "unchanged";
  changes: string[]; conflicts: string[]; verified: boolean; goodUnverified: boolean;
  decision: string | null; dmReady: boolean; needsDirectVerification: boolean;
};

const QUALS = ["Qualified", "Needs Review", "Not Relevant"] as const;
const MARK = "[TikTok master import]";

export function tiktokHandle(v: string | null | undefined): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  const m = s.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i) || s.match(/^@?([A-Za-z0-9._-]{2,40})$/);
  return m ? m[1].replace(/\.+$/, "").toLowerCase() : null;
}

function normQual(v?: string) {
  const s = (v || "").trim().toLowerCase();
  if (!s || s === "not checked") return null;
  if (s === "bad") return "Not Relevant";
  if (s === "uncertain") return "Needs Review";
  if (/^(qualified|good|yes|approved|keep)$/.test(s)) return "Qualified";
  if (/needs? review|maybe|unsure/.test(s)) return "Needs Review";
  if (/not relevant|reject|no$|^no\b|irrelevant/.test(s)) return "Not Relevant";
  return QUALS.find((q) => q.toLowerCase() === s) ?? null;
}
const truthy = (v?: string) => /^(yes|y|true|1|verified|x)$/i.test((v || "").trim());
const validDate = (v?: string) => /^\d{4}-\d{2}-\d{2}/.test((v || "").trim()) ? v!.trim().slice(0, 10) : null;

export const importTikTokMasterChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: MasterRow[]; dryRun: boolean; createMissing: boolean; seenHandles: string[]; batchLabel?: string }) => {
    if (!Array.isArray(d?.rows) || d.rows.length > 300) throw new Error("Send 1–300 rows per chunk");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const handles = new Map<string, MasterRow>();
    const results: RowResult[] = [];
    const seen = new Set(data.seenHandles);
    for (const r of data.rows) {
      const h = tiktokHandle(r.profile);
      if (!h && !r.id?.trim()) { results.push({ line: r.line, handle: null, id: null, outcome: "invalid", changes: [], conflicts: ["No TikTok profile or CRM id"], verified: false, goodUnverified: false, decision: null, dmReady: false, needsDirectVerification: false }); continue; }
      if (h && (seen.has(h) || handles.has(h))) { results.push({ line: r.line, handle: h, id: null, outcome: "duplicate_in_file", changes: [], conflicts: [], verified: false, goodUnverified: false, decision: null, dmReady: false, needsDirectVerification: false }); continue; }
      if (h) handles.set(h, r);
    }
    // Load candidate CRM rows by handle / id.
    const ids = data.rows.map((r) => r.id?.trim()).filter(Boolean) as string[];
    const cols = "id,name,tiktok,qualification_status,personalized_dm,full_verification,verification_evidence,verification_date,research_notes,contacted_date";
    const found: any[] = [];
    const hs = [...handles.keys()];
    for (let i = 0; i < hs.length; i += 40) {
      const ors = hs.slice(i, i + 40).map((h) => `tiktok.ilike.%@${h}%`).join(",");
      const { data: rows, error } = await sb.from("creators").select(cols).or(ors);
      if (error) throw new Error(error.message);
      found.push(...(rows ?? []));
    }
    if (ids.length) {
      const { data: rows, error } = await sb.from("creators").select(cols).in("id", ids);
      if (error) throw new Error(error.message);
      found.push(...(rows ?? []));
    }
    const byHandle = new Map<string, any>(); const byId = new Map<string, any>();
    for (const c of found) { byId.set(c.id, c); const h = tiktokHandle(c.tiktok); if (h && !byHandle.has(h)) byHandle.set(h, c); }

    const rowsToProcess = data.rows.filter((r) => !results.some((x) => x.line === r.line));
    for (const r of rowsToProcess) {
      const h = tiktokHandle(r.profile);
      const c = (r.id?.trim() && byId.get(r.id.trim())) || (h ? byHandle.get(h) : undefined);
      const decisionRaw = (r.decision || "").trim();
      const qual = normQual(r.qualification || decisionRaw);
      const indirect = /no direct tiktok|public indexed/i.test(r.method || "");
      const dm = (r.dm || "").trim();
      const evidence = (r.evidence || "").trim();
      const reviewer = (r.reviewer || "").trim();
      const date = validDate(r.reviewDate);
      const verified = !indirect && !decisionRaw && qual === "Qualified" && truthy(r.verified) && evidence.length >= 40 && Boolean(reviewer) && Boolean(date) && Boolean(h);
      const goodUnverified = qual === "Qualified" && !verified;
      const changes: string[] = []; const conflicts: string[] = [];
      const patch: Record<string, unknown> = {};
      const batch = (data.batchLabel || "").trim().slice(0, 40) || "master CSV";
      const screenNote = decisionRaw && decisionRaw.toLowerCase() !== "not checked"
        ? `${MARK} ${batch} screening (NOT direct TikTok verification): Decision ${decisionRaw}; Method: ${(r.method || "unstated").trim().slice(0, 200)}${evidence ? `; Evidence: ${evidence.slice(0, 1200)}` : ""}${r.publicUrl?.trim() ? `; Source: ${r.publicUrl.trim().slice(0, 300)}` : ""}`
        : "";
      const extra = (crmDm: string | null | undefined, rev: boolean) => ({
        decision: decisionRaw || null,
        dmReady: qual === "Qualified" && Boolean(dm || crmDm?.trim()),
        needsDirectVerification: qual === "Qualified" && !rev,
      });

      if (!c) {
        if (!h) { results.push({ line: r.line, handle: null, id: r.id ?? null, outcome: "invalid", changes, conflicts: ["CRM id not found"], verified: false, goodUnverified: false, decision: null, dmReady: false, needsDirectVerification: false }); continue; }
        if (!data.createMissing) { results.push({ line: r.line, handle: h, id: null, outcome: "new_skipped", changes, conflicts, verified, goodUnverified, ...extra(null, false) }); continue; }
        const row: Record<string, unknown> = {
          id: `TIKTOK-${h.toUpperCase()}`, name: (r.name || "").trim() || `@${h}`, tiktok: `https://www.tiktok.com/@${h}`,
          normalized_domain: `tiktok:@${h}`, primary_platforms: "TikTok", imported_by: context.userId,
          qualification_status: qual, personalized_dm: dm || null,
          research_notes: screenNote || `${MARK} Added from qualification master.${evidence && !verified ? ` Unverified evidence: ${evidence.slice(0, 1500)}` : ""}`,
        };
        if (verified) Object.assign(row, { full_verification: `Verified for TikTok DM — ${reviewer.slice(0, 80)} — ${date} (master CSV)`, verification_evidence: evidence.slice(0, 2000), verification_date: date });
        if (!data.dryRun) {
          const { error } = await sb.from("creators").upsert(row as never, { onConflict: "id", ignoreDuplicates: true });
          if (error) throw new Error(`Line ${r.line}: ${error.message}`);
        }
        results.push({ line: r.line, handle: h, id: row.id as string, outcome: "new", changes: ["new creator"], conflicts, verified, goodUnverified, ...extra(null, verified) });
        continue;
      }

      // Qualification: fill empty only; never change an existing value.
      if (qual) {
        if (!c.qualification_status) { patch.qualification_status = qual; changes.push(`qualification → ${qual}`); }
        else if (c.qualification_status !== qual) conflicts.push(`qualification CRM "${c.qualification_status}" vs CSV "${qual}" (kept CRM)`);
      }
      // DM: fill empty only.
      if (dm) {
        if (!c.personalized_dm?.trim()) { patch.personalized_dm = dm; changes.push("personalized DM added"); }
        else if (c.personalized_dm.trim() !== dm) conflicts.push("different DM already in CRM (kept CRM)");
      }
      const hasReview = /^(Verified|Rejected) for TikTok DM/.test(c.full_verification || "");
      if (verified && !hasReview && !c.contacted_date && (c.qualification_status ?? qual) === "Qualified") {
        Object.assign(patch, { full_verification: `Verified for TikTok DM — ${reviewer.slice(0, 80)} — ${date} (master CSV)`, verification_date: date });
        if (!c.verification_evidence?.trim()) patch.verification_evidence = evidence.slice(0, 2000);
        else patch.verification_evidence = `${c.verification_evidence}\n${evidence}`.slice(0, 4000);
        changes.push("verified for Rena");
      } else if (verified && hasReview) conflicts.push("already reviewed in CRM (kept)");
      else if (verified && c.contacted_date) conflicts.push("already contacted — not added to Rena");
      // Unverified evidence: append once to research notes, tagged.
      if (screenNote) {
        const key = `${batch} screening (NOT direct TikTok verification): Decision ${decisionRaw}`;
        if (!(c.research_notes || "").includes(key)) {
          patch.research_notes = `${(c.research_notes || "").trim()}\n${screenNote}`.trim();
          changes.push("screening evidence noted");
        }
      } else if (evidence && !verified && !(c.research_notes || "").includes(evidence.slice(0, 60))) {
        patch.research_notes = `${(c.research_notes || "").trim()}\n${MARK} Unverified evidence: ${evidence.slice(0, 1500)}`.trim();
        changes.push("unverified evidence noted");
      }
      if (changes.length && !data.dryRun) {
        const { error } = await sb.from("creators").update(patch as never).eq("id", c.id);
        if (error) throw new Error(`Line ${r.line}: ${error.message}`);
      }
      results.push({ line: r.line, handle: h, id: c.id, outcome: changes.length ? "updated" : "unchanged", changes, conflicts, verified, goodUnverified, ...extra(c.personalized_dm, hasReview || changes.includes("verified for Rena")) });
    }
    return { results: results.sort((a, b) => a.line - b.line), handles: hs };
  });
