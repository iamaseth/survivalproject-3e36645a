# Survival Tabs Influencer — End-of-day checkpoint — 2026-09-27

Resume command: `$continue dev survival tabs influencers`

## Current focus
Manual personalized TikTok outreach with reliable confirmation and daily reporting for Rena.

## Workflow agreed
1. Creator begins in **Not contacted / Ready to Contact**.
2. Worker clicks TikTok/contact. Opening the profile automatically moves creator to **Needs Contact Confirmation**. This does NOT mean a message was sent and must NOT count as contacted.
3. Worker manually reviews profile, personalizes message, sends DM in TikTok, returns to CRM.
4. Needs Contact Confirmation is intentionally simple:
   - Open TikTok again
   - Additional notes (optional)
   - ✓ Sent — move to Contacted / waiting
   - Could not send — return to Ready
5. Only ✓ Sent is a confirmed contact and should count toward Rena's daily report.
6. Confirmed creators move to **Contacted / waiting**.

## Changes made today
- Commit `6127e270937577c876718d8ade0a4fa2ba14152c`: simplified Needs Contact Confirmation; added optional notes and explicit Sent confirmation.
- Commit `2ebd8f27da043a8e0282cb14890fe06efa1d5211`: added **Rena daily outreach sheet** inside Contacted / waiting.
- Rena report is based on today's confirmed sends only.
- Report actions: **View / Print** and **Download CSV**.
- Printable sheet includes creator, TikTok, contact method, notes, and blank Rena follow-up/reply area.
- No Lovable credits used.

## Important next step
Before Rena relies on this workflow, test one creator end-to-end in the live/published app:
Ready → click TikTok → Needs Contact Confirmation → optional note → ✓ Sent → Contacted / waiting → confirm appears in Rena daily sheet → print preview / CSV.

Check that the report count is based on confirmed sends and not profile opens.

## Existing project references
- Repo: https://github.com/iamaseth/survivalproject-3e36645a.git
- Lovable editor: https://lovable.dev/projects/2d7f9356-04a7-4000-bd94-816d039b0754
- Published app historically: https://survivalproject.lovable.app
- BoBo TikTok search/checklist: https://survivalproject.lovable.app/bobo-search
- Generic creators CRM: https://survivalproject.lovable.app/creators

## Rules
- Do not use Lovable credits unless Seth explicitly authorizes them.
- Do not automate TikTok sending. Sending remains manual.
- Do not count Needs Contact Confirmation as contacted.
- Keep outreach locked from accidental bulk sending.
- Durable state belongs in GitHub, not only ChatGPT memory.
