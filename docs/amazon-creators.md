# Amazon Creators workflow

Purpose: turn Amazon Live / shoppable-video discoveries into qualified Survival Tabs creator prospects without creating a separate CRM.

## Discovery loop
1. Start from a Survival Tabs Amazon review or Amazon Live video.
2. Open **Explore related content**.
3. Add relevant creators to **Amazon Creators** in the existing Survival Tabs Hub.
4. Save the exact Amazon video/storefront URL so duplicates can be detected.
5. Enrich public YouTube / Instagram / TikTok / business contact routes.
6. Score fit 0–100.
7. Record video intelligence: hook → problem → product introduction → demonstration → reaction → benefits → objections → CTA → setting/length.
8. High-fit creators move into the normal Creator Partnerships outreach workflow; Amazon discovery does not bypass Perry/Rena approval rules.

## Reference video
https://www.amazon.com/live/video/03c6133b0f7a41fab0ead7f9c7b30019

## Database migration
`supabase/migrations/20260812073000_add_amazon_creator_intelligence.sql`

The migration is additive and nullable so it does not change existing creator records. It must be applied to the connected Supabase project before the Amazon Creators page is made live.
