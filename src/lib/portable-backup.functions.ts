import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BACKUP_TABLES = [
  "admin_audit_log", "amazon_discovery_candidates", "bobo_research_progress",
  "creator_reply_classifications", "creator_workspace", "creators", "creators_archive",
  "email_templates", "gmail_messages", "gmail_poll_state", "gmail_send_errors",
  "outreach_campaigns", "outreach_queue_items", "profiles", "reviewed_creators",
  "sales_prospects", "team_messages", "team_role_assignments", "user_roles",
  "youtube_candidates",
] as const;

// Deliberately excluded: app_user_connections and ingest_tokens.
// Those tables may contain connection credentials/tokens and should never be
// written into a portable backup downloaded to a user's disk.
export const exportPortableBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "executive").maybeSingle();
    if (!roleRow) throw new Error("Executive role required to export a full backup.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tables: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    const pageSize = 1000;

    for (const table of BACKUP_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await context.supabase
          .from(table)
          .select("*")
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`Backup failed while reading ${table}: ${error.message}`);
        const page = data ?? [];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      tables[table] = rows;
      counts[table] = rows.length;
    }

    return {
      format: "survival-influencer-portable-backup",
      version: 1,
      generatedAt: new Date().toISOString(),
      safety: {
        excludedSecrets: ["app_user_connections", "ingest_tokens"],
        note: "OAuth/connector credentials and ingest tokens are intentionally excluded.",
      },
      counts,
      tables,
    };
  });
