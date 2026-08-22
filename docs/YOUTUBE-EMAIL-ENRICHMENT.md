# YouTube Email Enrichment

## Purpose

Increase the number of usable creator business contacts without changing the existing Creator CRM or sending outreach automatically.

## Pipeline

1. **YouTube API discovery**
   - Google Apps Script searches the approved Survival Tabs keyword set.
   - Channel IDs are de-duplicated.
   - Subscriber count, activity, and recent-video performance are used to qualify small creators.
   - Qualified candidates are staged in `public.youtube_candidates`.

2. **Enrichment queue**
   - Only candidates with `status = 'pending'` and no `business_email` or `description_email` enter the enrichment queue.
   - Higher-subscriber and more recently active candidates are processed first.

3. **Public contact enrichment**
   - Follow the Browser-Act `youtube-channel-business-email` pattern.
   - Read the public YouTube About page.
   - If an email is present in public description text, store it.
   - Otherwise inspect creator-controlled outbound links such as a personal/business site or link aggregator and look for a publicly published business email.
   - Record `email_source`, `external_links`, `enrichment_status`, `enrichment_checked_at`, and any `enrichment_error`.

4. **Human review**
   - The existing YouTube Candidates UI continues to use **Keep / Skip**.
   - Keep promotes a candidate into the existing `creators` table with de-duplication by YouTube channel ID and email.
   - No automatic email is sent during discovery or enrichment.

5. **Existing CRM / Gmail outreach**
   - Once a creator is kept, the existing CRM and Gmail workflow remain responsible for review, drafting, sending, follow-up, samples, and campaign tracking.

## External worker API

`GET /api/public/youtube-enrichment?limit=100`

Returns pending candidates that need enrichment. Requires the same `x-ingest-secret` used by the YouTube candidate ingest endpoint.

`POST /api/public/youtube-enrichment`

Example result payload:

```json
{
  "id": "candidate-uuid",
  "business_email": "creator@example.com",
  "email_source": "linked_website:creator.com",
  "external_links": [
    { "title": "Website", "url": "https://creator.com", "kind": "personal_or_business" }
  ],
  "status": "found",
  "error": null
}
```

Allowed result statuses are `found`, `no_email_found`, and `error`.

## Privacy and access boundary

This workflow is for creator-published business contact information visible on public YouTube pages or creator-controlled public websites. It does **not** bypass authentication, access controls, or YouTube's CAPTCHA-gated **View email address** feature. If an email exists only behind that gate, the worker records no public email rather than attempting to circumvent it.
