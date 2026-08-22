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
Design an additive queue model with:
- campaign id
- creator id
- sequence step
- template id/version
- subject/body snapshot
- image reference
- scheduled/not-before time
- status: pending/approved/sending/sent/failed/skipped/cancelled
- Gmail message/thread id
- attempt count
- error reason
- idempotency key unique across campaign + creator + step

Acceptance criteria:
- adding a queue never modifies/deletes creator rows;
- re-running preparation cannot duplicate planned sends;
- sent items are never sent again by retry;
- auth/systemic error stops the batch;
- individual bad records are logged and skipped safely.

## Milestone 4 — Reply triage
- Store incoming reply first.
- Run deterministic classification fallback.
- Categories: interested, ask_price, ask_sample, rejected, posted, needs_human, invalid.
- Add risk flags for price/sample/shipping/inventory.
- Never auto-commit business terms.
- Surface classification + recommended next action for human review.

## Milestone 5 — Follow-up sequence
Default candidate sequence, subject to user approval:
- Initial outreach
- Follow-up 1 after 5 days if no reply
- Follow-up 2 after 10 days if no reply

Rules:
- Any reply cancels pending automated follow-up steps.
- Declined/inactive creators receive no further sends.
- Follow-ups use the existing Gmail thread when possible.
- Daily cap is configurable.

## Milestone 6 — Campaign context
Add campaign context without replacing existing creator data:
- name
- goal
- product context
- sample policy
- allowed offer/commission notes
- forbidden promises
- brand tone
- default template
- daily send cap
- status

## Milestone 7 — Analytics
Track per campaign:
- queued
- sent
- failed
- replies
- positive replies
- declined
- sample requested/shipped
- content published

## Verification plan
Before any production schema/application change:
1. Verify exact backend identity.
2. Record baseline row counts.
3. Confirm current recovery snapshot/checkpoint.
4. Apply additive migration only.
5. Verify counts unchanged for existing tables.
6. Test with test/internal creator records first.
7. Enable production queue only after round-trip mailbox test passes.

## Current next step
Wait for production mailbox connection details while continuing creator enrichment and list expansion. In parallel, safe code-only helpers for deterministic reply classification and queue design may be staged in GitHub without activating production sends.
