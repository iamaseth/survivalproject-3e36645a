# Survival Tabs creator enrichment

Cross-platform research for existing creators and pending YouTube candidates.

## Safety model

- Read-only against Supabase.
- Produces a JSON review artifact; it does not update creator records.
- Uses only publicly exposed web pages/links.
- Never guesses an email, social handle, or Amazon storefront.
- A discovered Amazon link is accepted only when it is an `amazon.com/shop/...` URL that successfully loads.
- Existing creator records are not deleted, replaced, reseeded, or downgraded.
- Human review is required before suggestions are applied to CRM.

## What it looks for

- Public business email addresses
- Instagram
- TikTok
- Facebook
- YouTube
- Websites and link-in-bio hubs
- Verified Amazon Influencer storefronts

The worker starts with URLs already associated with each creator/candidate, follows public website/link-hub links, and records evidence for every page checked.

## Run

```bash
SUPABASE_URL='https://PROJECT.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='...' \
ENRICHMENT_LIMIT=100 \
node tools/creator-enrichment/src/main.mjs
```

Optional output path:

```bash
ENRICHMENT_OUTPUT=creator-enrichment-review.json
```

## Output

`creator-enrichment-review.json` contains existing identifiers, suggested emails, suggested cross-platform links, verified Amazon storefront suggestions, and the evidence URLs/statuses used to produce each suggestion.

The output is deliberately a review queue. A separate reviewed-apply step should be used later so automatic research cannot silently overwrite trusted CRM data.
