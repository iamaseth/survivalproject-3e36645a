# YouTube Enrichment Worker

This folder contains safe helper tooling for enriching YouTube candidates with public contact information.

## Current state
The CRM already has the queue/result server functions in `src/lib/youtube-candidates.functions.ts`. This worker layer is intentionally separate so enrichment can be tested and resumed without changing or rebuilding CRM data.

## Operating sequence
1. Export/read a small enrichment queue from the CRM.
2. Test with 1–2 channels.
3. For each channel, inspect the public YouTube About description.
4. If no email is present, inspect creator-owned/business links, then link aggregators.
5. Run public page text through `extract_public_emails.py`.
6. Save one result immediately before moving to the next channel.
7. Apply the result to the corresponding candidate only after validation.

## Example email extraction

```bash
python scripts/youtube-enrichment/extract_public_emails.py --text 'Business: hello@example.com'
```

Expected output:

```json
{"emails": ["hello@example.com"]}
```

The helper also recognizes common public obfuscation such as `hello [at] example [dot] com`.

## Browser-act integration
The preferred browser layer is the public `browser-act/skills` YouTube business-email workflow. It reads public About metadata and may inspect creator-controlled outbound pages. It does not provide a supported way to bypass YouTube's CAPTCHA-protected email reveal, and our pipeline must not attempt to bypass it.

Browser automation is not embedded into the CRM itself. This keeps:
- CRM authentication separate from browser sessions;
- failures resumable;
- enrichment optional;
- production data protected from scraper/browser errors.

## Production guardrail
Do not run a bulk enrichment write until the Creator CRM database recovery/inventory is complete. The helper scripts can be developed/tested safely, but production writes remain paused until the correct database is identified and backed up.
