# Survival Tabs Multi-Platform Creator Discovery

## Goal
Build a **6,000-row raw creator pool** before qualification, then reduce it through factual platform verification and relevance filtering until roughly **1,000 strong creator leads** remain.

This is intentionally separate from outreach. Discovery and verification must never send messages or modify existing approved CRM contacts.

## Platforms
Initial discovery platforms:
- YouTube
- TikTok

A creator who appears on both platforms should ultimately resolve to one creator identity with multiple platform profiles, not two outreach leads.

## Funnel
1. **RAW DISCOVERY — target 6,000 unique platform profiles**
   - Use Perplexity/web search and other discovery sources.
   - Capture only factual discovery fields: creator/channel name, platform, direct profile/channel URL, search theme/source.
   - Do not require subscriber/follower count at this stage.
   - Do not spend time finding email/contact data at this stage.

2. **PLATFORM VERIFICATION**
   - YouTube: verify with the YouTube Data API where possible.
   - TikTok: verify profile existence and factual public profile metrics through the TikTok verification adapter/source selected for the run.
   - Never infer or fabricate follower counts, handles, emails, or profile URLs.

3. **HARD FILTER**
   - Primary campaign target: 1,000–20,000 followers/subscribers unless campaign rules are explicitly changed.
   - Remove dead/invalid profiles and duplicates.

4. **WEED OUT**
   - Remove obvious direct competitors.
   - Remove government agencies and emergency-management departments.
   - Remove institutions, major commercial brands, news organizations, and unrelated profiles.
   - Keep creator-led small businesses when the creator/audience is relevant.

5. **RELEVANCE REVIEW**
   - Review actual creator content/audience fit for Survival Tabs.
   - Strong adjacent topics include preparedness, prepping, food storage, emergency food, homesteading, off-grid living, self-reliance, camping, hiking, backpacking, bushcraft, EDC, survival/outdoor gear, RV/van life, overlanding, emergency power, water filtration, first aid, storm/disaster preparedness, hunting/fishing, and outdoor families.

6. **CONTACT ENRICHMENT — survivors only**
   - Public business email, website/contact page, Instagram, TikTok, YouTube contact route, or other legitimate public creator profile.
   - Never guess email addresses.

7. **FINAL EXCEL → CRM → RENA REVIEW**
   - Upload only qualified new candidates.
   - Preserve dedupe and do-not-contact controls.
   - No automatic outreach.

## Division of labor
- **Perplexity/web**: broad raw discovery.
- **Harness**: long-running repetitive verification/checkpoint orchestration after the raw list exists.
- **YouTube Data API**: factual YouTube channel verification.
- **TikTok adapter/source**: factual TikTok profile verification.
- **ChatGPT/AI review**: qualitative competitor/government/brand/relevance filtering after factual verification.
- **Rena**: final human approval before outreach.

## Harness rule
Harness should not be used for subjective scoring or contact research. Its useful role is to read the raw file, call deterministic verification tools/APIs, write factual fields, checkpoint frequently, and resume until every input row is marked VERIFIED or FAILED.

## Raw file schema
Required columns:
- `raw_id`
- `creator_name`
- `platform`
- `profile_url`
- `handle_or_channel_id`
- `discovery_query`
- `discovery_source`
- `verification_status`
- `verified_name`
- `verified_platform_id`
- `followers_subscribers`
- `recent_activity`
- `filter_status`
- `filter_reason`
- `notes`

## Safety
- Never overwrite working YouTube discovery code to add TikTok.
- Add new platform adapters separately.
- Never commit API keys/session cookies/tokens.
- Never treat generated creator names as verified.
- Never contact creators from the raw discovery list.
