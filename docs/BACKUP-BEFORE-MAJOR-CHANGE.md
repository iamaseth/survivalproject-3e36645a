# BACKUP-BEFORE-MAJOR-CHANGE

This rule applies to all Survival Tabs development work.

## Mandatory rule
Before any major or destructive change, create and verify a recoverable backup first.

A major change includes:
- database migrations that move, rename, truncate, delete, or transform records
- bulk imports or bulk updates
- table restructuring
- replacing or re-seeding CRM data
- deleting or archiving source datasets
- large Apps Script rewrites
- major GitHub refactors that affect data flows
- changing ingestion/authentication logic

## Required pre-change checklist
1. Export or snapshot the affected live data.
2. Record the source row count.
3. Save the backup outside the live application.
4. Preserve supporting evidence fields such as creator IDs, review URLs, contact routes, notes, and workflow status.
5. Confirm the backup can be opened/read before proceeding.
6. For code changes, commit current source to GitHub first.
7. For Apps Script, keep a current source copy in GitHub; Script Properties/secrets must never be committed.

## Required post-change verification
1. Verify destination row count.
2. Spot-check representative records and evidence links.
3. Confirm the application reads the new data correctly.
4. Only after verification may the old/source data be deleted or retired.

## Recovery layers
Critical datasets should have at least three recovery layers:
1. Live application/database.
2. Dated external export/snapshot (Drive/CSV/SQL export).
3. Source/recovery manifest in GitHub containing non-secret metadata needed to reconstruct the dataset.

## Secret handling
Never place plaintext API keys, crawler tokens, ingestion secrets, passwords, OAuth credentials, or other private credentials in GitHub backup files. Backups should contain references to where secrets are stored, not the values themselves.

## Critical Survival Tabs datasets
- Main Creator CRM
- Emerging Creators <=20K shortlist
- Reviewed Survival Tabs and MRE creators, including exact review evidence URLs
- Amazon creator/review discovery
- Outreach history and sample status
- Google Sheets staging/recovery datasets
- YouTube discovery Apps Script source
- Content/Knowledge Center source data
