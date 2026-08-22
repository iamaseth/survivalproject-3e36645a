# YouTube candidate ingestion (for the existing Apps Script)

The existing Google Apps Script + YouTube API workflow posts verified channels
straight into the app. Nothing is auto-promoted: rows land in a staging table
and a human presses Keep or Skip on the Creators page. No email is ever sent by
this endpoint.

## Endpoint

```
POST https://survivalproject.lovable.app/api/public/youtube-candidates
```

Preview/testing URL: `https://project--2d7f9356-04a7-4000-bd94-816d039b0754-dev.lovable.app/api/public/youtube-candidates`

## Headers

```
Content-Type: application/json
x-ingest-secret: <YOUTUBE_INGEST_SECRET>
```

The secret is a server-side project secret. It is never present in client code.
Store it in the Apps Script under **Project Settings → Script properties** and
read it with `PropertiesService.getScriptProperties().getProperty('INGEST_SECRET')`.

## Batch payload

Max 500 rows per request.

```json
{
  "batch_id": "2026-02-11T09:00Z-run1",
  "rows": [
    {
      "channel_id": "UCxxxxxxxxxxxxxxxxxxxxxx",
      "channel_url": "https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx",
      "channel_title": "Backwoods Prep",
      "subscriber_count": 12400,
      "video_count": 231,
      "country": "US",
      "description_email": "hello@backwoodsprep.com",
      "business_email": "biz@backwoodsprep.com",
      "topic_keyword": "emergency food",
      "last_upload_at": "2026-02-03T14:22:00Z",
      "source": "apps_script",
      "notes": "optional free text"
    }
  ]
}
```

Only `channel_id` is required. Invalid emails are dropped rather than failing
the row. `last_upload_at` accepts any ISO-8601 date/time.

## Response

```json
{
  "ok": true,
  "received": 120,
  "inserted": 87,
  "skipped_duplicate": 31,
  "skipped_do_not_contact": 2
}
```

Errors: `400` invalid payload, `401` bad/missing secret, `503` secret not yet
configured on the server, `500` database error.

## Dedup and safety behaviour

- `channel_id` is the unique key of the staging table; re-posting the same
  channel is a no-op, so the script can be run repeatedly (idempotent).
- A channel already present in `creators.youtube_channel_id`, or whose email
  already exists on a live creator, is skipped as a duplicate.
- Channels matching a do-not-contact creator (by channel id or email) are stored
  as `status = skipped`, `email_status = suppressed` and never surface for review.
- The endpoint only writes to `youtube_candidates`. It never inserts into
  `creators`, never changes outreach state, and never sends mail.

## Suggested Apps Script call

```javascript
function pushBatch(rows) {
  var secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  var res = UrlFetchApp.fetch('https://survivalproject.lovable.app/api/public/youtube-candidates', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ batch_id: new Date().toISOString(), rows: rows }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
```

Post in chunks of ≤500 rows.
