import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type FileIn = { fileName: string; md: string };
export type FileResult = { fileName: string; handle?: string; status: "imported" | "skipped" | "error"; reason?: string };

const MAX_MD = 2_000_000;

function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)$/);
    if (kv) out[kv[1].trim().toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function findHandle(md: string, meta: Record<string, string>, fileName: string): string | null {
  const re = /tiktok\.com\/@([A-Za-z0-9._]{2,24})/i;
  for (const k of ["source", "url", "profile_url", "link"]) {
    const v = meta[k]?.match(re); if (v) return v[1].toLowerCase();
  }
  const body = md.match(re); if (body) return body[1].toLowerCase();
  const fn = fileName.match(/@([A-Za-z0-9._]{2,24})/); return fn ? fn[1].toLowerCase() : null;
}

export const uploadResearchFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { files: FileIn[] }) => {
    if (!Array.isArray(data?.files) || data.files.length < 1 || data.files.length > 50) throw new Error("Send 1–50 files per batch");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles, error: roleErr } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (roleErr) throw new Error(roleErr.message);
    const allowed = ["executive", "research_manager", "partnership_manager", "partnership_coordinator"];
    if (!(roles ?? []).some(r => allowed.includes(r.role))) throw new Error("Forbidden: research team role required");

    const results: FileResult[] = [];
    const parsed: { fileName: string; handle: string; md: string; meta: Record<string, string> }[] = [];
    const seen = new Set<string>();
    for (const f of data.files) {
      const fileName = String(f.fileName ?? "").slice(0, 300);
      const md = typeof f.md === "string" ? f.md : "";
      if (!/\.md$/i.test(fileName)) { results.push({ fileName, status: "error", reason: "Not a .md file" }); continue; }
      if (!md.trim()) { results.push({ fileName, status: "error", reason: "Empty file" }); continue; }
      if (md.length > MAX_MD) { results.push({ fileName, status: "error", reason: "File too large" }); continue; }
      const meta = frontmatter(md);
      const handle = findHandle(md, meta, fileName);
      if (!handle) { results.push({ fileName, status: "error", reason: "No TikTok handle found" }); continue; }
      if (seen.has(handle)) { results.push({ fileName, handle, status: "skipped", reason: "Duplicate in this upload" }); continue; }
      seen.add(handle);
      parsed.push({ fileName, handle, md, meta });
    }
    if (!parsed.length) return results;

    const handles = parsed.map(p => p.handle);
    const { data: staged, error: sErr } = await supabase.from("influencer_research_staging")
      .select("handle,md_content").in("handle", handles);
    if (sErr) throw new Error(sErr.message);
    const stagedMap = new Map((staged ?? []).map(s => [s.handle, s.md_content]));

    // Match existing CRM creators by normalized TikTok handle (read only).
    const { data: creators, error: cErr } = await supabase.from("creators").select("id,tiktok")
      .or(handles.map(h => `tiktok.ilike.%@${h}%`).join(","));
    if (cErr) throw new Error(cErr.message);
    const creatorByHandle = new Map<string, string>();
    for (const c of creators ?? []) {
      const m = String(c.tiktok ?? "").match(/@([A-Za-z0-9._]{2,24})\/?(?:$|[?#])/);
      if (m) creatorByHandle.set(m[1].toLowerCase(), c.id);
    }

    for (const p of parsed) {
      const evidence = {
        file_name: p.fileName, frontmatter: p.meta, title: p.meta.title ?? null,
        clipped_at: p.meta.created ?? p.meta.date ?? null, description: p.meta.description ?? null,
        matched_creator_id: creatorByHandle.get(p.handle) ?? null,
        uploaded_by: userId, uploaded_at: new Date().toISOString(),
      };
      const profile_url = `https://www.tiktok.com/@${p.handle}`;
      if (stagedMap.has(p.handle)) {
        if (stagedMap.get(p.handle)) { results.push({ fileName: p.fileName, handle: p.handle, status: "skipped", reason: "Already staged" }); continue; }
        const { error } = await supabase.from("influencer_research_staging")
          .update({ md_content: p.md, evidence }).eq("handle", p.handle).is("md_content", null);
        results.push(error ? { fileName: p.fileName, handle: p.handle, status: "error", reason: error.message }
          : { fileName: p.fileName, handle: p.handle, status: "imported" });
        continue;
      }
      const { error } = await supabase.from("influencer_research_staging").insert({
        handle: p.handle, profile_url, md_content: p.md, evidence,
        source: "BoBo Tab Clipper upload", research_stage: "clipped",
      } as never);
      if (error?.code === "23505") results.push({ fileName: p.fileName, handle: p.handle, status: "skipped", reason: "Already staged" });
      else results.push(error ? { fileName: p.fileName, handle: p.handle, status: "error", reason: error.message }
        : { fileName: p.fileName, handle: p.handle, status: "imported" });
    }
    return results;
  });
