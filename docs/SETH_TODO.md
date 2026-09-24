# Seth — Influencer CRM to-do

## Instagram search and Markdown intake (2026-09-24)

- [ ] Add an **Instagram** option to BoBo's **existing Lovable influencer search page**, reusing the same 500 search topics currently listed for TikTok. Do not replace or reset the TikTok list, its saved progress, or the existing `$bobo` workflow.
- [ ] Keep **independent completion status per platform and search topic**. Finishing TikTok search 141 must not mark Instagram search 141 complete. Retain the existing open-search / mark-completed interaction.
- [ ] Generate Instagram keyword-search links for each topic; test a small sample in BoBo's logged-in browser before publishing the full list, because Instagram search URLs and UI may vary.
- [ ] Label each Markdown clipping with **platform (TikTok or Instagram)** and search topic, while retaining the original profile/post URLs. Do not require BoBo to sort files manually.
- [ ] When Seth uploads a mixed Markdown batch, identify the platform from **actual profile URLs** (`tiktok.com/@...` versus `instagram.com/...`), using the clipping label as a cross-check; flag ambiguous/mixed entries rather than guessing.
- [ ] Extract and deduplicate creators **within each platform**; match TikTok and Instagram identities separately in the CRM. Never merge accounts across platforms solely because their handles are identical; require independent evidence.
- [ ] Prepare source-backed creator import/enrichment data from clippings; preserve existing verified CRM fields and outreach history. Do not infer followers, reach, paid partnerships, or monetization from adjacent unrelated posts.
- [ ] Test the Instagram clipping workflow with a few real profile pages, then verify saved progress and mixed-platform Markdown processing end to end before marking complete.

**Scope:** This is a future Seth implementation task, not a completed Lovable change. Existing TikTok collection and BoBo's daily workflow must continue working unchanged. Related one-pass TikTok importer work: [PR #11](https://github.com/iamaseth/survivalproject-3e36645a/pull/11) (draft; not deployed).
