# Reviewed Survival Tabs & MRE — Recovery Manifest

Status: recovery in progress. Do not restore blindly into the live CRM until sources are consolidated and backed up.

## Confirmed source 1 — YouTube review catalog
Drive source title: `Category,Video Title,Link,Year Publ.txt`
Drive file id: `1VTJwQLR6I_g7qtYGH1ya6iUsaCWTJHTK`
Created: 2026-08-12
Contains review category, video title, exact YouTube link, year, views, creator/influencer, product information, audience hook, and viewer-value notes.

Known real Survival Tabs review evidence includes:
- Survival On Purpose — https://www.youtube.com/watch?v=eDqSSKkSVys
- Brads Journey — https://www.youtube.com/watch?v=Sf4FO8TLQdw
- DropForgedSurvival — https://www.youtube.com/watch?v=NIMnbmvZTR4
- Gundog4314 / Survival Focus — https://www.youtube.com/watch?v=ylm7RW-YtW8
- Camping Survival — https://www.youtube.com/watch?v=LZNC5IjNHjk
- Wobbly Otter Outdoors — https://www.youtube.com/watch?v=KIIf_GrbIxk
- Edge 29 Chaos — https://www.youtube.com/watch?v=_jxcFdbnbVo
- Country Prepper — https://www.youtube.com/watch?v=JRCdszRJ9oY
- Outdoor Adventurecraft — https://www.youtube.com/watch?v=2_ZjHa8Deoc
- Dynasty Preppers — https://www.youtube.com/watch?v=FBMAwoDXJuQ
- Survival Food Source — https://www.youtube.com/watch?v=Uhajlixk-SM

Caution: this source also contains placeholder-looking YouTube IDs such as `v_tab_*`, `v_rat_*`, `v_mre_*`, and `v_diy_*`. Those records must be verified before being marked as verified review evidence.

## Confirmed source 2 — Amazon Live Survival Tabs review
Exact evidence URL:
https://www.amazon.com/live/video/03c6133b0f7a41fab0ead7f9c7b30019

Recovery clue source: Drive text file titled `meta name=google-site-verification.txt`, file id `19j0SMPDHOVlyYXpxKOA7003jkOb9d5el`, created 2026-08-12.

IMPORTANT: that Drive file also contains private credential material. Do not copy the entire file into GitHub or any public recovery dataset. Only the non-secret review evidence URL above is preserved here.

## GitHub history proving the dedicated workflow existed
On 2026-08-13 the app added a Reviewed Survival Tabs and MRE workspace and then created a dedicated `reviewed_creators` database table. The migration copied rows tagged `Reviewed Survival Tabs and MRE` from the main `creators` table into `reviewed_creators`, then deleted those tagged rows from `creators`.

Relevant historical commits include:
- `811ab366d95e7a4b1447b6cd6fb1c79349943503` — Add Reviewed Survival Tabs and MRE creator workspace
- `f722f73bee0bb65ada9838eb9976d0e9a45d5386` — Show copyable original YouTube URLs in reviewed creator list
- `850780b30b06123555cf749974a637a25ce3ab7d` — Show original review metadata and match creator workflow
- `18958531faa2642f660f5734c4c33c9736b5863a` — Separate reviewed creators into dedicated table

## Recovery policy
1. Preserve every located source before restoring anything.
2. Consolidate creator + platform + exact review URL + review title + year/views when available + contact data + outreach state.
3. Mark evidence as VERIFIED only when the source URL itself is real and attributable to the creator.
4. Preserve unverified/placeholder records separately for research; do not discard them.
5. Create a dated external backup of the consolidated list before live CRM import.
6. Verify source and destination record counts before any cleanup/deletion.
