# CreatorReach AI Audit — Survival Tabs Creator CRM

Date: 2026-08-22

## Objective
Audit `chaoyubai8-tech/creatorreach-ai` against the existing Survival Tabs Creator CRM and identify what is genuinely useful without replacing working functionality or spending Lovable credits.

## What CreatorReach contributes
CreatorReach's core workflow is:

Campaign setup -> add creators -> generate first outreach email -> create Gmail drafts -> record creator replies -> classify/summarize replies -> track follow-up progress.

Useful concepts to borrow:

1. **Campaign context**
   - product/selling points
   - sample policy
   - commission/pricing policy
   - forbidden promises
   - brand tone

2. **Lifecycle stages**
   - to contact
   - draft pending review
   - Gmail drafted
   - sent
   - replied
   - negotiating
   - sample
   - filming/content
   - completed

3. **Reply classification**
   Categories:
   - interested
   - ask_price
   - ask_sample
   - rejected
   - posted
   - needs_human
   - invalid

4. **Risk flags**
   - price_commitment
   - sample_commitment
   - shipping_commitment
   - inventory_commitment

5. **Batch task bookkeeping**
   CreatorReach separates a campaign-level task from per-creator task records. This is useful for bulk draft/send/retrieval jobs because failures can be resumed without restarting the whole batch.

6. **Human-in-the-loop**
   CreatorReach creates Gmail drafts and does not auto-send. Survival Tabs may support controlled direct sends, but bulk outreach must still use approval, daily caps, deduplication and a durable send log.

## What Survival Tabs already has
The current CRM is already ahead of CreatorReach in several areas:

- Real Gmail connection per app user.
- Gmail draft creation.
- Direct Gmail send with returned `messageId` + `threadId`.
- Gmail message logging in Supabase.
- Incoming reply polling and storage.
- Matching replies by creator email or known Gmail thread.
- Follow-up workflow states including Waiting for Reply and Follow-up Due.
- Gmail send error logging and reconnect state.
- Approved reusable email templates.
- Template photo support.
- Creator workspace/activity tracking.
- Separate creator discovery/enrichment pipeline.

Therefore **do not replace the existing Gmail or workflow system with CreatorReach**.

## Gaps worth implementing

### P0 — Required before production bulk email
1. Connect the intended production mailbox `info@thesurvivaltabs.com`.
2. Add a durable bulk outreach queue/task model.
3. Add duplicate-send protection per creator/campaign/step.
4. Add configurable daily send cap and stop-on-error behavior.
5. Confirm background reply retrieval can run reliably in the deployed environment.

### P1 — High value
1. Reply classification with deterministic fallback.
2. Risk flags for price/sample/shipping/inventory commitments.
3. Campaign-level context so templates and replies know the approved offer terms.
4. Follow-up sequence definitions such as initial -> +5 days -> +10 days.
5. Inbox triage queue: reply received -> classification -> next action -> human review.

### P2 — Later
1. Nox-style creator qualification/scoring.
2. Published-video monitoring.
3. Campaign analytics: sent, delivered/known, replied, positive, declined, sample, published.

## Architecture decision
Preserve the current Survival Tabs stack:

Discovery/enrichment -> creators -> campaign assignment -> approved template/photo -> send queue -> Gmail -> `gmail_messages` -> reply retrieval -> classification -> creator workflow -> follow-up queue -> published-content monitoring.

Do not import CreatorReach's SQLite architecture or Gmail token storage. Use Supabase + the existing app-user Gmail connector.

## Safety requirements
- Append/upsert only; no rebuild/reset/reseed of creator data.
- Never bulk-send without explicit campaign approval.
- Keep a durable idempotency key for every planned send.
- Stop a batch on authentication/systemic errors; do not retry blindly.
- Never invent pricing, commission, inventory, sample shipment or delivery timing.
- Any reply involving money, inventory, shipping or sample commitment must be flagged for human review.
- Do not use Lovable AI/edit credits by default.

## Current blocker
The production sender mailbox is not yet connected. Rena has stated that `info@thesurvivaltabs.com` is used through Microsoft Outlook. Bulk send/retrieval should be finalized only after the mailbox connection route is confirmed.
