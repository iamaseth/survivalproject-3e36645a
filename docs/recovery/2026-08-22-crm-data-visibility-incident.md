# CRM Data Visibility Incident — 2026-08-22

## Summary
The CRM appeared to have lost creator, reviewed creator, template, and workspace data. Direct inspection of the Lovable-managed Supabase database showed that the records were still present. The actual failure was missing Row Level Security (RLS) policies on several tables: RLS was enabled, but authenticated users had no SELECT policy, so the application received empty result sets and displayed empty states.

## Correct Lovable project
- Lovable project: `2d7f9356-04a7-4000-bd94-816d039b0754`
- App: Survival Influencer / `survivalproject`
- Database status: enabled, Supabase stack

## Pre-fix live row counts
- creators: 83
- creators_archive: 250
- reviewed_creators: 11
- creator_workspace: 3
- email_templates: 6
- amazon_discovery_candidates: 2
- youtube_candidates: 0
- gmail_messages: 1
- profiles: 3
- user_roles: 3
- team_role_assignments: 8

## Root cause
RLS was enabled on `creators`, `reviewed_creators`, `creator_workspace`, `email_templates`, and `team_role_assignments`, but `pg_policies` contained no policies for those tables. This caused authenticated app queries to return zero rows even though the data remained in PostgreSQL.

## Recovery backup
Before restoring write access, an internal recovery snapshot was created in schema:

`recovery_backup_20260822`

Snapshot counts were verified equal to live counts:
- creators: 83 / 83
- creators_archive: 250 / 250
- reviewed_creators: 11 / 11
- creator_workspace: 3 / 3
- email_templates: 6 / 6
- amazon_discovery_candidates: 2 / 2
- youtube_candidates: 0 / 0

The backup is inside the same database, so it is an immediate recovery checkpoint, not a substitute for an external database backup/export.

## RLS recovery
Added authenticated-team SELECT policies for:
- creators
- reviewed_creators
- creator_workspace
- email_templates
- team_role_assignments

Added authenticated-team INSERT/UPDATE policies for:
- creators
- reviewed_creators
- creator_workspace
- email_templates

No DELETE policies were added. This follows the AI OS global rule: APPEND BY DEFAULT — NEVER ERASE DATA.

The policy set is recorded in migration:
`supabase/migrations/20260822062000_restore_team_rls_access.sql`

## Verification
RLS was simulated as an authenticated team user after recovery. Visible counts were:
- creators: 83
- reviewed_creators: 11
- email_templates: 6
- creator_workspace: 3
- team_role_assignments: 8

Therefore the apparent data-loss event was primarily a visibility/access-control failure, not deletion of these datasets.

## Remaining work
1. User refreshes/reloads the live CRM and confirms Creators, Reviewed Survival Tabs/MRE, Templates, and workspace data render again.
2. Audit other tables/routes for missing or over-broad RLS policies.
3. Create an external recurring backup/export strategy for critical operational data.
4. Restore/populate `youtube_candidates` only after the existing spreadsheet/discovery data is safely imported using append + deduplicate.
5. Do not use Lovable AI/edit credits unless explicitly approved; direct database/GitHub work should be preferred.
