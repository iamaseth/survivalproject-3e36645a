# Survival Tabs YouTube Influencer Discovery

## Purpose
Discover small YouTube creators for Survival Tabs outreach, enrich public business-contact data, and stage qualified candidates for the Influencer CRM.

## System of record
- Lovable: application/UI/platform
- Lovable-managed Supabase-compatible backend: live CRM data
- Google Apps Script + YouTube Data API: discovery worker
- Google Sheet `20 influencers`, tab `YouTube Discovery Rebuild`: recovery/staging copy of current discovery output
- GitHub: source-of-truth backup for automation code and migrations

## Current discovery configuration
- Maximum subscribers: 20,000
- Current full run: 850 raw results, 792 unique channels, 540 channels <=20K
- Do not rerun discovery merely to import existing results.

## Important Apps Script functions
- `runInfluencerDiscovery()` — performs YouTube discovery and writes results to the sheet.
- `sendExistingResultsToCRM()` — imports existing sheet rows to `/api/public/youtube-candidates` in batches; do not use until ingestion authentication is synced in the managed backend.
- `showIngestSecretHash()` — prints only the SHA-256 digest of the private `INGEST_SECRET`.

## Script Properties
Required private properties in Apps Script:
- `YOUTUBE_API_KEY`
- `INGEST_SECRET`

Never commit the plaintext values to GitHub.

## Safety rules
1. Never bulk-delete or overwrite CRM data without a verified backup.
2. Never rerun discovery just to recover/import rows already present in the sheet.
3. Imports must deduplicate by YouTube channel ID.
4. Discovery/import staging must never automatically send outreach email.
5. Keep do-not-contact suppression intact.
6. Before destructive migrations: backup -> verify row count -> migrate -> verify destination -> only then remove source.

## Current blocker
The Apps Script `INGEST_SECRET` was rotated. Its SHA-256 verifier migration is committed in `supabase/migrations/`, but the Lovable-managed backend must apply/sync that migration before `sendExistingResultsToCRM()` will authenticate.

## Next work while Lovable credits are unavailable
1. Preserve the complete Apps Script source in this folder when exported/copied from Apps Script.
2. Clean the 540 candidates: exclude government agencies, institutions, irrelevant businesses, inactive/dead channels, and poor-fit creators.
3. Enrich remaining candidates using only publicly available business/contact information from YouTube descriptions and linked public websites/social profiles.
4. Expand discovery terms only after measuring how many of the 540 become qualified, contactable creators.
5. Target outcome: 1,000 qualified, usable business email contacts—not merely 1,000 channels.
