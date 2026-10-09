# Survival Tabs — Influencer review handover (2026-10-09)

**For BoBo / សម្រាប់ BoBo** — Continue the existing work. **Do not restart, delete, or bulk reclassify creators.** / បន្តការងារចាស់ កុំចាប់ផ្តើមឡើងវិញ ឬលុបទិន្នន័យ។

## Source of truth
- Live CRM: https://survivalproject.lovable.app/creators
- Lovable project: https://lovable.dev/projects/2d7f9356-04a7-4000-bd94-816d039b0754
- GitHub repository: https://github.com/iamaseth/survivalproject-3e36645a
- Lovable Cloud database is the **actual** CRM database. Do not use unrelated Supabase projects.
- At the last inspection there were ~2,605 creators in the live `creators` table. This is a dated snapshot, not a current count.
- Historical master list `survival-tabs-influencer-master.csv` (2,067 creators) and older batch checkpoint 28 refer to an earlier separate workflow. Do not import or restart it without reconciling against live CRM IDs and duplicates.

## IMPORTANT: 2,000+ creator qualification is NOT completed

The user explicitly confirms the full qualification pass of 2,000+ creators **has not been performed**. Do not confuse imported records, automated labels, or a handful of manually reviewed examples with actual completed creator qualification. **Never report the entire list as qualified or screened.**

The historical batch checkpoint (last batch 27 / next batch 28, previously 1,455 unchecked) is only a dated snapshot from a separate process, not verified current progress. The CRM has more rows than the original list and may contain duplicate/imported/staging records. Before resuming, reconcile original creator identifiers against live CRM, count actual evidence-backed profile reviews separately from automated labels, and produce an explicit reviewed/unreviewed queue. Continue from the last verified review; do not start over or falsely mark the rest complete.

**BoBo's manual fallback:** review creators from the **unverified** queue, check their real profiles, record source evidence and decision, and save it in the CRM. Do not assume a `Qualified` or `Not Relevant` database value means a human checked the profile. For automation, pilot evidence-backed collection first and retain manual approval.

## Live database reconciliation — 2026-10-09 (read-only query)

Actual Lovable Cloud `public.creators`: **2,605** total.
- `qualification_status IS NULL`: **1,840** (unclassified)
- `qualification_status='Qualified'`: **381**
- `qualification_status='Not Relevant'`: **246**
- `qualification_status='Needs Review'`: **138**
- `seth_approval_status='approved'`: **3**; `rejected`: **10**; NULL: **2,592**
- Nonblank `verification_evidence`: **159** records (not necessarily evidence of complete human profile review)
- Nonblank `verification_date`: **3** records
- TikTok URLs present: **2,083** records
- Nonblank `last_researched`: **1,863** records (a date alone is not proof of review)
- Research statuses include `Researching` 1,343; `Needs review` 578; `Imported — needs review` 182; other categories.

**Interpretation:** At least **1,840** have no qualification status, and another **138** are explicitly Needs Review: **1,978** require qualification/decision by current status. However, the remaining 627 labels are not proof of verified public-profile inspection. The count of **verified, evidence-backed human reviews is unknown**, not 627. Do not treat 159 evidence fields or 13 manual decisions as exhaustive verification counts. Reconcile each creator before asserting reviewed status. Counts may change after this snapshot.

## Current workflow / របៀបធ្វើការ
1. Open creator in CRM, then open their actual public TikTok profile. / បើកប្រវត្តិ TikTok ពិត។
2. If automatic collection is unavailable, use **Obsidian Web Clipper → Copy to clipboard** and paste Markdown into ChatGPT. The custom Chrome clipper was attempted but did not work on the user's computer; do not depend on it.
3. Review visible profile description and multiple captions, not just one hashtag. Determine **Relevant**, **Not Relevant**, or **Needs Review**; record specific evidence and source URL. Do not invent missing evidence.
4. In CRM, confirm **Profile reviewed**, then manually **Reject** or **Approve**. Manual decision supersedes *automated qualification*, not explicit opt-outs or contact restrictions. Never send outreach automatically.
5. Approvals require documented direct research, a grounded saved DM, and an eligible uncontacted creator; approved creators are assigned to Seth or Rena. Rejection needs no DM.
6. Verify the CRM saved the decision; do not treat a ChatGPT recommendation as a database update. Keep previous classifications/audit history.

## Review examples (based only on pasted TikTok clips)
- `@acbrillantes` (Ayen Brillantes): **strong preparedness match**; captions on stored water, gardening, food storage, oxygen absorbers, backup lighting. CRM previously `Qualified` but `response_followup='Not Relevant'`; manual approval override is designed for this case. No final approval was confirmed.
- `@_maym111` (May): **Not Relevant / borderline**; one emergency-bag rice post amid general home/lifestyle/shopping. Last observed CRM qualification `Not Relevant`, no manual decision confirmed.
- `@_zoepatterson` (Zoe): **Not Relevant**; college, sorority, music, fashion and routine. CRM write/read attempt was blocked; no saved manual decision confirmed.
- `@00stella_fr`: **Not Relevant**; school routines, baking, lifestyle, one emergency-bag post. No saved manual decision confirmed.
These are recommendations, not proof of stored CRM decisions.

## Software checkpoint
- PR #19 https://github.com/iamaseth/survivalproject-3e36645a/pull/19 was merged into main.
- Database function `public.manual_qualification_override` was applied to Lovable Cloud and verified to exist. It preserves prior automated classification in `seth_approval_history` and checks authorized approver, prior contact, opt-outs, evidence and DM.
- Application code: `src/components/SethReviewPanel.tsx`, `src/lib/creators.functions.ts`, migration `drizzle/migrations/0004_manual_override.sql`.
- Commit `a11efbfee73d7c15fc021ee1967bf231160d3191` changed Reject from silently disabled to clickable with a clear 'Profile reviewed' instruction.
- Lovable deployment was requested but returned **pending**; end-to-end manual approval/rejection has **not been verified**. Check actual production deployment and test with a safe eligible record before assuming it works.
- **Caution:** The manual approval path still depends on saved verified evidence and DM, and the new override must be tested end-to-end; do not loosen opt-out/contact safeguards to make a button work.

## Next engineering plan (NOT implemented)
Automate **public profile collection → evidence-backed AI prequalification → human approval/rejection → Rena queue**. Free-first approach: existing GitHub/Lovable CRM plus local Playwright worker; optionally Firecrawl for accessible pages. TikTok can rate-limit/block scraping. No fabricated qualifications: inaccessible profiles go to Needs Review. Do not store video files in Supabase; store lightweight source URLs/captions/evidence and timestamps. Pilot 10–20 profiles, compare to manual decisions, then batches of ~100 if reliable. Keep human approval as final authority.

## BoBo quick commands / ប៊ូតុងការងារ
- **Continue manual review / បន្តពិនិត្យ**: Open CRM and take next undecided creator.
- **Copy TikTok clip / ចម្លងព័ត៌មាន TikTok**: Obsidian Web Clipper → Copy to clipboard → paste to ChatGPT.
- **Approve / អនុម័ត**: Verify actual profile and grounded DM; save in CRM.
- **Reject / បដិសេធ**: Confirm profile reviewed; click Reject; verify save.
- **Next / បន្ទាប់**: Move to next undecided creator.
- **Handover / ប្រគល់ការងារ**: Update this file with date, count, and outstanding blockers.

## Non-negotiable data safeguards
Do not delete creator rows or clear genuine `do not contact`, `do not send`, `dm blocked`, opt-out, sent, or contacted records. Do not overwrite manual decisions with automated classifications. Back up before bulk changes. All profile conclusions must be evidence-backed.

## Later master-file checkpoint discovered (2026-10-09)
The actual Library `survival-tabs-influencer-master.csv` (2,067 rows) contains **1,032 screened rows** and **1,035 `Not checked` rows**. Decisions: Good 103; Bad 436; Uncertain 436; Uncertain — Manual Review 57. The Screening Method field references **Playwright Batch 41 and Batch 42** (100 each), so the older Batch 37 checkpoint is stale. **Do not restart at Batch 38**. This is a screening-status inventory, not proof all 1,032 had reliable direct TikTok verification. Reconcile with the Lovable CRM before writing, and inspect the next `Not checked` rows in the master for Batch 43. Historical counts in preceding sections remain as historical snapshots.
