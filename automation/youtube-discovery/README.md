# Survival Tabs YouTube Influencer Discovery

## Purpose
Discover small YouTube creators for Survival Tabs outreach, enrich public business-contact data, and stage qualified candidates for the Influencer CRM.

Canonical qualification rules: `docs/CREATOR-DISCOVERY-QUALIFICATION.md`.

This YouTube worker is now one verification/discovery component inside the broader multi-platform funnel documented at `automation/creator-discovery/README.md`.

## System of record
- Lovable: application/UI/platform
- Lovable-managed Supabase-compatible backend: live CRM data
- Google Apps Script + YouTube Data API: YouTube discovery/verification worker
- Google Sheet `20 influencers`, tab `YouTube Discovery Rebuild`: recovery/staging copy of current discovery output
- GitHub: source-of-truth backup for automation code and migrations

## Hard creator-size target
- Primary campaign maximum: **20,000 subscribers/followers**
- Current working preference: **1,000–20,000** for the primary Survival Tabs campaign
- Smaller promising niche creators may be retained separately for later review rather than mixed into the primary qualified set
- 1,000–5,000: very high priority
- 5,001–10,000: very high priority
- 10,001–20,000: high priority
- Over 20,000: exclude from the primary campaign

The goal is a large pool of relevant micro-creators, not celebrity influencers.

## Qualification standard
A strong candidate should be:

**Relevant + Active + 1K–20K + Contactable + Appropriate for Survival Tabs**

Strong topic connections include preparedness, prepping, survival, emergency food, emergency gear, bug-out bags, go bags, 72-hour kits, EDC, camping, hiking, backpacking, bushcraft, homesteading, off-grid living, food storage, overlanding, RV/van life, vehicle emergency preparedness, disaster/storm preparedness, outdoor gear, Amazon gear reviews, emergency communications/ham radio, and family preparedness.

Prefer channels with activity within roughly the last 90 days, but do not automatically reject less-frequent creators if the channel is clearly active and highly relevant.

Prioritize legitimate public contact paths: business email, website/contact page, Instagram, TikTok, YouTube contact information, or another public creator/business social profile. **Never guess email addresses.**

## Volume target
- Final target: **about 1,000 qualified creators**
- New raw-discovery target: **about 6,000 unique YouTube + TikTok platform profiles before verification/filtering**
- The raw 6,000 do not need subscriber/follower qualification yet; platform verification happens after discovery
- Do not fill the CRM with weak creators merely to reach 1,000

## Current YouTube discovery configuration
- Maximum subscribers: 20,000
- Historical full run: 850 raw results, 792 unique channels, 540 channels <=20K
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
8. Do not modify known-working YouTube code merely to add TikTok. TikTok must use a separate adapter/source.

## Current workflow
1. Build the broader raw pool toward roughly 6,000 YouTube + TikTok profiles using `automation/creator-discovery/`.
2. Use the YouTube API primarily to verify factual YouTube channel data rather than spending search quota on the whole discovery workload.
3. Verify TikTok profiles through a separate TikTok source/adapter.
4. Filter to the primary size range, remove duplicates, competitors, government/institutional accounts, major brands and irrelevant creators.
5. Perform qualitative relevance review.
6. Enrich public contact routes only for survivors.
7. Produce the final qualified Excel file and then stage new candidates for Rena/CRM review.
