# YouTube Contact Enrichment Pipeline

## Purpose
Enrich already-discovered YouTube creator candidates with public business-contact information without replacing or deleting existing records.

## Safety rules
- Existing creator/candidate data is never cleared, replaced, truncated, or bulk-reset.
- Enrichment operates on `youtube_candidates` staging records only.
- Results update one candidate at a time.
- Channel ID is the stable identity key.
- No outreach is sent automatically.
- Do-not-contact and suppression state are never changed by enrichment.
- Browser/email enrichment must be tested on 1–2 channels before batch use.
- Batch results are saved item-by-item so a failure can resume from the last completed channel.

## Existing application support
The application already exposes:
- `listYouTubeEnrichmentQueue()` — returns pending candidates without an email.
- `applyYouTubeEnrichmentResult()` — records one enrichment result.
- `keepYouTubeCandidate()` — promotes a reviewed candidate into the main creator roster with Channel-ID/email deduplication.

This means the missing piece is the external/public-contact lookup worker, not another CRM redesign.

## Lookup order
For each candidate:
1. Normalize Channel ID / handle / URL.
2. Open the YouTube channel About page.
3. Read public channel metadata and description.
4. If a business email appears in the public description, use it.
5. Otherwise inspect outbound links.
6. Skip social-network pages for automated email lookup.
7. Visit creator-owned/business websites first.
8. Then visit link aggregators (Linktree/Beacons-style pages).
9. If an email is found, save it with its source.
10. If no public email is found, mark `no_email_found` rather than inventing or guessing an address.

## Result contract
A worker should produce one record per candidate:

```json
{
  "id": "candidate-uuid",
  "business_email": "creator@example.com",
  "email_source": "description | linked_website:example.com | link_aggregator:example.com",
  "external_links": [],
  "status": "found | no_email_found | error",
  "error": null
}
```

The existing `applyYouTubeEnrichmentResult()` server function accepts this contract.

## Sources reviewed
Architecture was informed by:
- `browser-act/skills` YouTube channel business-email skill: public About metadata, description email, creator website/link-aggregator fallback, item-by-item persistence, resumable batching.
- `atsuyamaru/youtube_simple_influencer_search`: subscriber filters, duplicate-channel avoidance, sorting.
- `suphiyasin/Youtube-User-Finder`: reviewed but not adopted because it requires copying YouTube session cookies.
- `apiharbor/...youtubeapi`: optional paid fallback only; not a core dependency.
- `stel-oberts/youtube-channel-email-scraper`: not adopted; repository is primarily a service description rather than the advertised implementation.

## Deferred until CRM recovery is complete
Do not add migrations or new production-table columns until the correct Creator CRM database is identified and its current table/row inventory is backed up and verified.
