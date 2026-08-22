# Findings and plan: scaling to 1,000 usable public business emails

## 1. Existing YouTube / Apps Script ingestion path

There is none in this project. Verified:

- No `src/routes/api/` folder exists — the app has zero HTTP endpoints, so an Apps Script has nothing to POST to today.
- No YouTube Data API usage anywhere. The only YouTube references are stored profile URLs (`creators.youtube`) and link buttons.
- The only automated discovery is Amazon-based: `.github/workflows/amazon-creator-crawl.yml` + `tools/amazon-discovery-crawler/` writing into `amazon_discovery_candidates`, plus `src/lib/amazon-search.server.ts` / `amazon-search.functions.ts` (keyword scrape) surfaced on `/amazon-creators`.
- No secret named `YOUTUBE_API_KEY` is configured.

Conclusion: the Apps Script + YouTube workflow exists outside this app and is currently not connected. Nothing to reuse — only a receiving endpoint to add.

## 2. Current data sources and dedup

- `public.creators` (56 cols, 83 rows) — the live roster. Dedup: unique index on `lower(code)` and on `normalized_domain` (partial, non-empty). Insert paths (`importCreators`, `upsertCreatorFromResearch` in `src/lib/creators.functions.ts`) pre-check both keys, then `upsert(..., { onConflict: "id", ignoreDuplicates: true })`.
- `public.creator_workspace` (74 cols) — per-creator workflow state; holds `do_not_contact` (currently 0 rows flagged).
- `public.reviewed_creators` (11 rows) — creators who already reviewed Survival Tabs/MRE.
- `public.amazon_discovery_candidates` (2 rows) — staging with `status` + `promoted_creator_id` (a real Keep/Skip approval gate).
- `public.sales_prospects` (0 rows) — separate B2B import, dedup by `normalized_domain`.
- `public.creators_archive` — the retired ST-INF-001–250 roster; `seedCreatorsFromStatic` is a deliberate no-op and must stay that way.

Gap: there is no dedup key for a YouTube channel. A channel with no website domain and no code can be inserted twice.

## 3. Current UI flow for "under 20k" and email collection

- `/creators` is the KISS pipeline: 5 collapsible stages (Not contacted → Contacted → Follow up → Responded → Sample), search box, no size filter.
- Reach is free text only (`reach_signal`, `followers_signal`, e.g. "82.7K YouTube subscribers; ..."). There is **no numeric subscriber column**, so the app cannot filter or count "≤20k" at all today.
- Email is a plain `creators.email` text column, filled manually or by the AI research drawer. No verification status, no source-of-truth field, no "public business email" distinction.

## 4. Live counts the app can determine right now

| Metric | Value |
|---|---|
| creators (live roster) | 83 |
| creators with an email | 43 |
| creators missing email | 40 |
| reviewed_creators | 11 (0 with email) |
| amazon_discovery_candidates pending | 2 |
| do_not_contact flagged | 0 |
| creators ≤20k subscribers | **not computable** — no numeric field |

So against Perry's 1,000 target we are at 43 usable emails, and the ≤20k segmentation cannot be reported until subscriber count is stored as a number.

## 5. Smallest safe change (recommended)

Four narrow steps, no second Apps Script, no spreadsheet.

**Step A — one ingestion endpoint.** Add `src/routes/api/public/youtube-candidates.ts` (POST). The existing Apps Script posts batches of channels there with a shared-secret header (`YOUTUBE_INGEST_SECRET`, added in Project Settings → Secrets) plus Zod validation. Payload per row:

```text
{ channel_id, channel_url, channel_title, subscriber_count (number),
  video_count, country, description_email, business_email,
  topic_keyword, last_upload_at }
```

The handler is insert-only into a staging table and returns `{ inserted, skipped_duplicate, skipped_dnc }`. No writes into `creators`.

**Step B — one staging table + dedup keys.** New `public.youtube_candidates` mirroring the payload, with `status` (`pending` / `kept` / `skipped`), `promoted_creator_id`, `email_status` (`none` / `found` / `verified` / `invalid`), and a unique index on `channel_id`. Also add to `creators`: `youtube_channel_id` (unique partial index) and `subscriber_count int`. That makes the channel the dedup key across both tables, backfillable from existing `creators.youtube` URLs. Migration includes GRANTs + RLS as usual.

**Step C — reuse the Keep/Skip gate.** Extend `/amazon-creators`-style review onto the Creators page as a "Step 0 — New candidates" collapsible section (or a `/creators/candidates` tab), sorted by fit: `subscriber_count <= 20000` and has email first. Keep promotes into `creators` via the existing dedup-checked insert path, sets `promoted_creator_id`, and stamps `subscriber_count` + `youtube_channel_id`. Skip only sets status. Human approval stays mandatory; nothing auto-enters outreach.

**Step D — counts + do-not-contact enforcement.** A small counters strip on `/creators`: total roster, ≤20k, with email, missing email, pending candidates, progress toward 1,000. Ingestion rejects any channel whose email or channel id matches a `do_not_contact` record, so suppression survives re-ingestion.

Optional follow-up (not part of the minimum): an enrichment button on candidates missing email that runs the existing Lovable AI research path to look for a public business email, writing `email_status = 'found'` for human confirmation — never auto-contacting.

### Technical notes

- Endpoint lives under `/api/public/*` so the Apps Script can reach the published site without a Lovable session; security is the shared-secret header + Zod, and it performs no reads of PII back to the caller.
- Stable URL for the Apps Script: `https://survivalproject.lovable.app/api/public/youtube-candidates`.
- `seedCreatorsFromStatic` and `creators_archive` remain untouched.
- Existing Gmail safety states, test mode, and template flow are unaffected — candidates only become contactable after a human Keep.
