# Survival Tabs — Creator Enrichment Pipeline

## Objective

Continuously enhance every creator and research candidate with useful, public, verifiable information for qualification and outreach.

This is an enrichment system, not a replacement/import system.

## Non-destructive rules

1. Never delete an existing creator as part of enrichment.
2. Never create a second creator when a confident match to an existing record exists.
3. Never guess an email address, social handle, Amazon storefront, follower count, or identity match.
4. Never replace a populated field with an empty value.
5. Never replace a verified value with a weaker/unverified value automatically.
6. Keep source URL, discovery method, verification state, and research timestamp for new facts where supported.
7. Ambiguous matches remain `needs_review`; they are not merged automatically.
8. Outreach/contact history is never modified by enrichment.

## Information to collect

Priority order:

1. Public business email / legitimate contact page
2. YouTube channel and subscriber/activity data
3. Instagram profile
4. TikTok profile
5. Facebook/profile or page when relevant
6. Creator website / canonical domain
7. Link-in-bio pages (Linktree, Beacons, etc.)
8. Amazon creator storefront (`/shop/<handle>`) or other verified Amazon creator presence
9. Other public creator/business social accounts
10. Country/location when publicly stated
11. Niche/topics and Survival Tabs relevance
12. Recent activity / last post or upload
13. Product-review / affiliate behavior useful to partnership qualification

## Amazon enrichment

Amazon storefront discovery should primarily enrich creators already in the CRM rather than create a separate disconnected roster.

For each creator:

1. Inspect already-known public URLs and profile text for an explicit Amazon storefront link.
2. Inspect public link-in-bio / website links for Amazon creator links.
3. Where a known public social handle exists, generate storefront *candidates* using the handle, but do not save them as verified merely because the URL pattern is plausible.
4. Verify that the candidate resolves to a real creator storefront before attaching it.
5. Store/link the verified Amazon presence to the same creator record.
6. If identity is ambiguous, mark for human review rather than merging.

Influencer storefronts use `/shop/<handle>`-style URLs. Do not confuse these with Amazon brand/seller `/stores/...` pages.

## Matching hierarchy

Strong identifiers:

- exact YouTube channel ID/URL
- exact verified email
- exact canonical website/domain
- exact verified Amazon storefront
- exact social profile URL

Supporting identifiers:

- creator/channel name
- social handle
- country
- niche/topic overlap
- cross-links between profiles

Names alone are not sufficient for an automatic merge.

## Enrichment states

- `not_started`
- `in_progress`
- `needs_review`
- `enriched`
- `no_public_contact_found`
- `error`

A creator can be enriched even if one platform is missing. Missing data is not a reason to delete or downgrade the creator.

## Current application support

The existing creator model already supports research fields including email, Facebook, Instagram, TikTok, YouTube, Amazon presence, website/domain, platforms, priority and research notes. New enrichment work should extend/reuse these fields without destructive schema changes.

## Rollout

### Phase 1 — Existing information normalization

Parse and normalize information already present in creator/candidate records and known public links. Attach only verified data.

### Phase 2 — Cross-platform enrichment

Follow public creator-owned links to find business email, website, Instagram, TikTok, YouTube and Amazon storefront information.

### Phase 3 — Amazon verification

Verify explicit or strongly-derived `/shop/<handle>` storefront candidates and attach verified Amazon presence to the existing creator.

### Phase 4 — Research prioritization

Prioritize creators that are relevant + active + <=20K + contactable, with Amazon/product-review presence as an additional positive signal.

## UI principle

Research information belongs on the creator record. The separate Amazon Creators view may remain useful as a filtered view, but Amazon should be treated as an attribute/presence of a creator rather than a separate identity when a confident match exists.
