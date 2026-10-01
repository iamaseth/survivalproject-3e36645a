# TikTok DM Restriction — 2026-10-01

## Purpose
Permanent checkpoint for the Survival Tabs influencer outreach project so the investigation can resume without reconstructing the conversation.

## What happened
TikTok began blocking outbound DMs from the Survival Tabs account with:

> “This message may be in violation of our Community Guidelines, and has not been sent to protect our community. If you believe this was a mistake, let us know so we can review this along with recent messages.”

The account had successfully sent creator outreach DMs previously.

## Tests completed

### Outreach Runner vs TikTok itself
Blocked DMs occurred after opening creators through the Outreach Runner.

A controlled test was then performed by opening TikTok normally, searching for a creator inside TikTok, opening the profile, following/messaging, and sending from TikTok without using the Runner. The same block occurred.

Conclusion: the Outreach Runner/external profile link is not the cause.

### Promotional wording vs harmless message
Long promotional messages were blocked for multiple creators, including After Action Media (@afteractionmedia), Al's Survival (@alssurvival), and Appalachian Prepper (@appalachianprepper4.0).

Then a harmless test was sent to Prep Momma (@prep.momma), an existing TikTok Friend/mutual follow:

> Hi Prep Momma! Hope you're doing well.

TikTok blocked that message with the same Community Guidelines warning.

Conclusion: the problem is not simply the Survival Tabs promotional copy.

### Follow-back requirement
Prep Momma was already a Friend/mutual follow and the harmless message was still blocked.

Conclusion: lack of mutual following is not the cause.

## Working diagnosis
Evidence points to an account-level or automated TikTok DM filtering/restriction state. Exact cause and duration are not confirmed by TikTok.

Do not claim a fixed 24/48-hour restriction duration. A 24+ hour cooldown is a conservative operational test, not an official TikTok guarantee.

## Support
The Community Guidelines warning's “let us know” review option was used once.

TikTok web support was opened and a support-ticket path was found. Support initially gave generic DM guidance and later indicated the account might be restricted from direct messaging and offered “Submit a ticket.”

Recommended ticket explanation: normal messages to multiple accounts are blocked; the issue reproduces when navigating entirely inside TikTok; even a harmless greeting to an existing Friend is blocked; the account previously used DMs successfully; request account review/restoration of normal DM access.

## Operational decision / cooldown
Stop all new TikTok DMs during the cooldown.

Reference point used on 2026-10-01: approximately 3:15 AM California time.

Rena was instructed by email:
- Do NOT send TikTok DMs at 9:00 AM California time on 2026-10-01.
- Wait until 9:00 AM California time on 2026-10-02.
- At that time send ONE simple test message only.
- If TikTok blocks that test, stop and do not send more DMs.

This gives approximately 29 hours 45 minutes of no DM attempts from the reference point.

A reminder was also scheduled to check TikTok support on 2026-10-02.

## CRM / Outreach Runner handling
A new Runner action was added:

**DM Blocked / Retry Later**

Commit: `e46462bbb31eb151fce74ca91c31d54a06aee31d`

Behavior:
- stores `response_followup = "DM Blocked — Retry Later"`
- appends a dated note
- does not mark the creator Contacted
- does not change qualification
- removes the creator from the current Runner queue after reload.

Potential follow-up: shared Creators-page Ready logic may still count DM-blocked creators because `creatorReadyToContact` does not yet explicitly exclude `DM Blocked — Retry Later`. Runner itself excludes them.

## Qualification work completed the same day
Final audit of the 494 TikTok Ready-to-Contact export:
- 358 Qualified
- 136 Not Relevant
- 0 Needs Review

Final qualification CSV:
`survival-tabs-tiktok-494-FINAL-qualification.csv`

Qualification field/migration/import work commits:
- `ecca7a5e796d8fa4398ecaf7b57c7835b59b9430`
- `0199fe4c1053b7e2fbcbfbbf3cc6fbf3efa55099`
- `a437db963299893e1ebbd4055f45612e992a7080`
- `224d744667a102b1a101ef6853289fb253a781fd`
- `f5c53887e1928db3d5c99ca9cd41400eac03d6d9`

Lovable-managed database migration was applied successfully.

## GitHub automation research
Repos/tools discussed as possible workflow references included:
- 11AnJo/tiktok_dm — Selenium TikTok DM automation
- huuthang201/tiktok-streak — automated TikTok friend messaging
- Linkmail16/ReLttk-TikTok-Client-Bot — unofficial modular TikTok DM client/bot
- Zeeshanahmad4/TikTok-Shop-Affiliate-Outreach-Bot — TikTok Shop creator outreach automation
- Hormold/tiktok-warmup — Android/ADB account activity automation
- terrebonnefamoyuhed/tiktok-shop-bot — creator outreach/pipeline/manual-DM workflow concept
- mguozhen/koc-outreach — KOC outreach concept discussed

Important conclusion: automation can improve queueing, timing, personalization, tracking, throttling and follow-ups, but should not be used to bypass an active TikTok account restriction.

Desired future model after messaging works again:
1. Qualified creator selected by CRM.
2. Personalized message prepared.
3. Low-volume outreach distributed over time.
4. Human can perform actual Send.
5. CRM records result.
6. On DM-block error, mark Retry Later and stop further attempts.
7. Consider session safety rule: first block = mark/retry later; repeated blocks = warning/automatic session stop.

No official “safe” daily TikTok DM limit has been established. Do not treat 20/day or any other number as guaranteed safe. Restart with a very small test volume after recovery and increase cautiously only if successful.

## Email communications
Rena was successfully emailed about the restriction and later emailed explicit cooldown instructions.

Perry's direct send was blocked by the email tool's safety check, so a Gmail draft was created for Perry instead.

## Tomorrow's resume point
On 2026-10-02:
1. Check TikTok support/ticket response first.
2. Do not send anything before 9:00 AM California time.
3. At/after 9:00 AM California time, send ONE harmless test DM to an existing Friend.
4. If successful, record success and design a conservative low-volume schedule.
5. If blocked, stop immediately and continue the support/cooldown process.
6. Do not install or run a mass-DM bot as a workaround for the restriction.
