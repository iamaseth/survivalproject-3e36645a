# Survival Tabs YouTube Influencer Discovery

## Purpose
Discover small YouTube creators for Survival Tabs outreach, enrich public business-contact data, and stage qualified candidates for the Influencer CRM.

Canonical qualification rules: `docs/CREATOR-DISCOVERY-QUALIFICATION.md`.

## System of record
- Lovable: application/UI/platform
- Lovable-managed Supabase-compatible backend: live CRM data
- Google Apps Script + YouTube Data API: discovery worker
- Google Sheet `20 influencers`, tab `YouTube Discovery Rebuild`: recovery/staging copy of current discovery output
- GitHub: source-of-truth backup for automation code and migrations

## Hard creator-size target
- Primary campaign maximum: **20,000 subscribers/followers**
- No 1,000-follower minimum
- Under 1,000: include promising active niche creators
- 1,000–5,000: very high priority
- 5,001–10,000: very high priority
- 10,001–20,000: high priority
- Over 20,000: exclude from the primary campaign

The goal is a large pool of relevant micro- and nano-creators, not celebrity influencers.

## Qualification standard
A strong candidate should be:

**Relevant + Active + ≤20K + Contactable + Appropriate for Survival Tabs**

Strong topic connections include preparedness, prepping, survival, emergency food, emergency gear, bug-out bags, go bags, 72-hour kits, EDC, camping, hiking, backpacking, bushcraft, homesteading, off-grid living, food storage, overlanding, RV/van life, vehicle emergency preparedness, disaster/storm preparedness, outdoor gear, Amazon gear reviews, emergency communications/ham radio, and family preparedness.

Prefer channels with activity within roughly the last 90 days, but do not automatically reject less-frequent creators if the channel is clearly active and highly relevant.

Prioritize legitimate public contact paths: business email, website/contact page, Instagram, TikTok, YouTube contact information, or another public creator/business social profile. **Never guess email addresses.**

## Volume target
- Final target: **1,000 qualified creators ≤20K**
- Preferred discovery pool: **2,000–3,000 candidates** before filtering/enrichment
- Do not fill the CRM with weak creators merely to reach 1,000

## Current discovery configuration
- Maximum subscribers: 20,000
- Current full run: 850 raw results, 792 unique channels, 540 channels <=20K
- Do not rerun discovery merely to import existing results.

## Important Apps Script functions
- `runInfluencerDiscovery()` — performs YouTube discovery and writes results to the sheet.
- `sendExistingResultsToCRM()` — imports existing sheet rows to `/api/public/youtube-candidates` in batches.
- `showIngestSecretHash()` — prints only the SHA-256 digest of the private `INGEST_SECRET`.

## Script Properties
Required private properties in Apps Script:
- `YOUTUBE_API_KEY`
- `INGEST_SECRET`

Never commit plaintext secrets to GitHub.

## Safety rules
1. Never bulk-delete or overwrite CRM data without a verified backup.
2. Never rerun discovery just to recover/import rows already present in the sheet.
3. Imports must deduplicate by YouTube channel ID and known email where available.
4. Discovery/import staging must never automatically send outreach email.
5. Keep do-not-contact suppression intact.
6. Enrich existing creator records rather than creating duplicates where possible.
7. Before destructive migrations: backup -> verify row count -> migrate -> verify destination -> only then remove source.

## Current import status
The existing discovery results should be imported before spending YouTube API quota on another full run. Import remains staging-only: candidates first, human review/enrichment second, creator promotion only after qualification.

## Next work
1. Import the existing 540 <=20K candidates without deleting or overwriting existing creator records.
2. Clean the candidate pool: exclude government agencies, institutions, irrelevant businesses, inactive/dead channels, and poor-fit creators.
3. Rank candidates by relevance, size band, contactability, and recent activity.
4. Enrich candidates using only publicly available business/contact information from YouTube descriptions and linked public websites/social profiles.
5. Measure how many of the existing 540 become qualified/contactable.
6. Expand discovery terms and candidate volume toward 2,000–3,000 total candidates.
7. Continue filtering/enrichment until at least 1,000 strong qualified creator contacts are available for the campaign.
