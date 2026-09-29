# Survival Tabs — TikTok Personalization Workflow

Last updated: 2026-09-29

## Current checkpoint

The creator CRM personalization workflow is live and working.

CRM: https://survivalproject.lovable.app/creators

Current workflow:
1. Needs Personalization
2. Needs Review
3. Ready to Contact
4. Needs Contact Confirmation
5. Contacted / Waiting
6. Follow Up
7. Responded
8. Sample

## Batch process

1. In Creators, set Platform filter to **TikTok**.
2. Open **Needs Personalization**.
3. Click **Export next 200**.
4. Process the exported CSV outside the CRM.
5. For each creator:
   - If captured/public TikTok evidence supports a genuine personalization hook, set **Personalization Status = Ready** and populate the personalized DM/source.
   - If there is not enough reliable evidence, or the account appears to be a brand/news/competitor/non-creator account, set **Personalization Status = Needs Review** and do not invent personalization.
6. Import the completed CSV with **Import Personalized Outreach**.
7. The CRM routes:
   - Ready -> **Ready to Contact**
   - Needs Review -> **Needs Review**
8. Do not reprocess creators already in Ready to Contact.
9. Continue with the next TikTok batch of 200.

## Needs Review

Needs Review is persistent in the database through `personalization_status`.
These creators should be manually checked by opening the TikTok profile. After review, either personalize them and move them to Ready to Contact or treat them as not qualified if appropriate.

## Outreach behavior

For TikTok/social:
- Copy the saved personalized DM.
- Open the TikTok profile.
- Opening a social profile does NOT mark the creator Contacted.
- It moves the creator to **Needs Contact Confirmation**.
- Only after the message is actually sent should the user click **Sent** to move the creator to Contacted / Waiting.

## Current verified checkpoint from UI

At the latest checkpoint with the TikTok filter selected:
- Needs Personalization: 1,393
- Needs Review: 162
- Ready to Contact: 490
- Needs Contact Confirmation: 6
- Contacted / Waiting: 0

The latest imported 200-person TikTok batch split into 147 Ready and 53 Needs Review.

## Development rules

- GitHub is the code source of truth.
- Do not use Lovable AI credits for development changes.
- Preserve creator data and existing CRM workflow.
- Make small, safe changes.
- Do not fabricate creator/profile details.
