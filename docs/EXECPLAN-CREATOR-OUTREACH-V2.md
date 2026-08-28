# ExecPlan — Creator Outreach v2

Status: active design / safe staging
Date: 2026-08-22

## Objective
Build a controlled creator outreach system that can operate on hundreds to thousands of creators while preserving existing CRM data and using the intended Survival Tabs sender mailbox.

## Current verified foundation
- Existing creator CRM and workflow remain the source of truth.
- Gmail functions already support draft creation, direct send, message/thread logging, reply polling, creator/thread matching, and error logging.
- Workflow already models Waiting for Reply and Follow-up Due.
- Templates support approved reusable copy and optional photo.
- YouTube discovery/enrichment exists separately.
- Existing data must be preserved and expanded by append/deduplicate only.

## Constraints
- No destructive data operations.
- No Lovable AI/edit credits unless explicitly approved.
- No production bulk send until the intended mailbox is connected and tested.
- Bulk operations must be resumable and idempotent.
- No uncontrolled mass sending or duplicate follow-ups.
- Replies involving price, commission, inventory, shipping or sample commitments require human review.

## Milestone 1 — Audit and design
- [x] Audit CreatorReach AI.
- [x] Compare against current Gmail/workflow implementation.
- [x] Decide to preserve existing Gmail/Supabase architecture.
- [x] Identify missing queue/classification/campaign-context pieces.

## Milestone 2 — Mailbox connection
- [ ] Confirm how `info@thesurvivaltabs.com` can be connected: Gmail-compatible connector, Microsoft/Outlook connector, forwarding, or another approved path.
- [ ] Verify send identity.
- [ ] Verify reply retrieval.
- [ ] Send one controlled test to an internal address.
- [ ] Verify thread/reply round-trip into CRM.

## Milestone 3 — Bulk queue
- [x] `outreach_campaigns` and `outreach_queue_items` tables (additive, team RLS, no DELETE).
- [x] Durable idempotency key unique across campaign + creator + step.
- [x] Guard trigger: sent items immutable, cancelled items cannot be reactivated.
- [x] `prepareQueue` / `listQueueItems` / `setQueueItemStatus` / `suppressIneligibleQueueItems`.
- [x] KISS preparation/review UI (`/creators/outreach`, linked from the Creators page).
- [x] Sending stays locked; there is no send action and `sending_locked` defaults to true.

## Milestone 4 — Reply triage
- [x] Store first, classify second: raw `gmail_messages` rows untouched.
- [x] `creator_reply_classifications` stores category, confidence, risk flags, next action, human-review flag.
- [x] Categories: interested, ask_price, ask_sample, rejected, posted, needs_human, invalid.
- [x] Price/sample/shipping/inventory risk always requires human review.
- [x] Rejected/unsubscribe surfaced in the triage view and flagged for human review.
- [x] Compact triage view: creator, reply snippet/date, classification, risk flags, next action, review status.
- [x] No business terms are auto-committed.

## Milestone 5 — Follow-up sequence
- [x] Steps modelled only (initial / +5 days / +10 days) in `src/lib/outreach.ts`.
- [x] Replied, declined, and do-not-contact creators are ineligible for queued follow-ups.
- [x] "Stop follow-ups for replied / do-not-contact" cancels pending items.
- [ ] Automated sending — blocked.

## Milestone 6 — Campaign context
- [x] Campaign fields: name, goal, product context, sample policy, allowed offer notes,
      forbidden promises, brand tone, default template, daily send cap, status.

## Milestone 7 — Analytics
- [ ] Per-campaign analytics — pending, after sending is enabled.

## Verification (2026-08-28 continuation)
- Row counts before and after: creators 165, creator_workspace 3, gmail_messages 1,
  youtube_candidates 1061, reviewed_creators 11, creators_archive 250 — unchanged.
- Typecheck passes.
- Idempotency: same campaign + creator + step inserted twice → 1 row, 0 duplicates; test rows removed.
- Classifier verified on synthetic text for interested, ask_price, ask_sample, rejected, posted, needs_human.
- RLS on the three outreach tables matches the team-role pattern (SELECT/INSERT/UPDATE for
  authenticated team members via `user_roles`; no DELETE policy).

## Remaining blocker
Production sender mailbox connection plus round-trip verification before any bulk or
automated sending can be enabled.

