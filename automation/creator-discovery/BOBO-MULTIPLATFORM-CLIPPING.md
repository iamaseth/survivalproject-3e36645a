# BoBo — Multi-Platform Influencer Search + Obsidian Clipping

**Owner:** Seth  
**Research operator:** BoBo  
**Purpose:** Collect raw search-result pages only. BoBo does **not** enter creators into the CRM.

## Seth must set up BoBo's computer first

Before BoBo starts this workflow, Seth must:
1. Install **Obsidian** on BoBo's computer.
2. Install/configure the **Obsidian Web Clipper** browser extension.
3. Confirm one test clipping saves correctly as a Markdown (`.md`) file.
4. Show BoBo the folder where the clipped MD files are saved.
5. Keep the files until Seth uploads the completed MD batches to ChatGPT.

Do not ask BoBo to install/configure Obsidian herself unless Seth specifically wants her to learn that task.

## BoBo's only job

For every approved keyword:
1. Open the platform/search link.
2. Search the keyword.
3. Let the search results load.
4. Click **Obsidian Web Clipper**.
5. Save the **whole search-results page** as Markdown.
6. Confirm the MD file was saved.
7. Go to the next keyword.

**Do not:** copy creators one-by-one, make a spreadsheet, enter anything into the CRM, contact creators, deduplicate results, estimate followers, or decide whether a creator is approved.

Seth uploads the final MD files to ChatGPT. ChatGPT extracts creator names/profile links, cleans the results, deduplicates across files/platforms, prepares the staging Google Sheet/CSV, and the reviewed file is imported through the CRM Creator Import workflow.

---

## TikTok

Direct search template:

`https://www.tiktok.com/search?q=KEYWORD`

Example:

`https://www.tiktok.com/search?q=preppers`

### BoBo steps
1. Open the TikTok search link.
2. Replace/search the approved keyword if needed.
3. Stay on the search-results page; do not copy profiles one-by-one.
4. Clip the complete results page with Obsidian Web Clipper.
5. Save the MD and continue.

**Tested:** TikTok clipping preserves useful creator/video/profile information.

---

## Instagram

Open Instagram:

`https://www.instagram.com/`

Use Instagram Search and enter the approved keyword, for example:

`preppers`

Prefer the **Accounts/Profiles** results when Instagram offers result categories.

### BoBo steps
1. Open Instagram.
2. Search the keyword.
3. Display the creator/account search results.
4. Clip the complete results page with Obsidian Web Clipper.
5. Save the MD and continue.

**Tested:** Instagram clipping preserved creator names, handles, and direct profile URLs.

---

## Facebook

Facebook test/search entry:

`https://www.facebook.com/search/top?q=preppers`

For another keyword, use Facebook Search and replace `preppers` with the approved keyword.

Prefer creator-relevant **People, Pages, Posts, or Reels** results rather than Marketplace/products.

### BoBo steps
1. Open Facebook and search the keyword.
2. Choose the most creator-relevant results.
3. Clip the complete results page.
4. Save the MD.
5. Continue to the next keyword.

**Status:** workflow still needs a final MD-quality test before Facebook is marked fully approved.

---

## Amazon Influencers

Do **not** search Amazon Live manually. Use Google to find Amazon Influencer storefronts.

Google search:

`https://www.google.com/search?q=site%3Aamazon.com%2Fshop+prepper`

Search-query template:

`site:amazon.com/shop KEYWORD`

Examples:
- `site:amazon.com/shop prepper`
- `site:amazon.com/shop survival`
- `site:amazon.com/shop emergency preparedness`
- `site:amazon.com/shop food storage`
- `site:amazon.com/shop off grid`

### BoBo steps
1. Open Google.
2. Search `site:amazon.com/shop KEYWORD`.
3. Clip the **Google search-results page**, not individual Amazon products.
4. Save the MD.
5. Continue.

**Tested:** Google clipping preserved Amazon storefront names, direct `amazon.com/shop/...` links, and useful descriptions. ChatGPT removes product/sponsored-result noise later.

---

## YouTube

Direct YouTube search template:

`https://www.youtube.com/results?search_query=KEYWORD`

Example:

`https://www.youtube.com/results?search_query=preppers`

YouTube already has a separate discovery/verification pipeline in this repository. MD clipping may be used as an additional discovery source, but it must **not replace or modify** the working YouTube automation.

---

## File naming

When possible, save clips using:

`PLATFORM - KEYWORD - YYYY-MM-DD.md`

Examples:
- `TikTok - preppers - 2026-09-22.md`
- `Instagram - preppers - 2026-09-22.md`
- `Amazon - prepper - 2026-09-22.md`

If automatic clipping produces another filename, **do not stop the work just to rename it**. Seth/ChatGPT can normalize filenames later.

## Handoff

When BoBo finishes a batch, she tells Seth the MD files are ready.

**BoBo stops there.**

Seth uploads the MD files to ChatGPT. ChatGPT performs extraction, normalization, deduplication, qualification/staging, and Google Sheet/CSV creation before any CRM import.
