# BoBo — Survival Tabs Influencer Screening (2026-10-08)

## Mandatory rule: qualify BEFORE writing or sending
This instruction is shared across Seth's and BoBo's computers. It governs manual TikTok outreach in https://survivalproject.lovable.app/outreach-runner. No automatic sending. A relevant topic does not automatically mean a suitable influencer.

1. Inspect each creator's TikTok profile screenshot and visible content. Identify whether this is an independent creator, a business/retailer/competing brand, or uncertain.
2. Return a prominent decision FIRST: CONTACT CANDIDATE, NEEDS REVIEW, or NOT RELEVANT. Explain the visible evidence and limitations. Do not fabricate facts about unseen videos.
3. CONTACT CANDIDATE: independent creator with a genuinely relevant audience and content, no clear competing brand conflict. If only the bio was inspected, ask to check recent videos before sending. Write a personalized draft only after screening. Human sends manually and marks Contacted only after confirmed delivery.
4. NEEDS REVIEW: uncertain fit, ownership, content, identity, business-versus-creator distinction, or complementary business opportunity. Do NOT draft/send a DM yet. Mark Needs Review in the CRM.
5. NOT RELEVANT: competing preparedness product company, retailer selling its own competing products, unrelated account, unsuitable/low-quality lead. Do NOT draft/send. Mark Not Relevant in CRM.
6. Never mark Contacted just because TikTok was opened, a DM was drafted, or a message failed. Do not change production creator rows through testing.
7. In Outreach Runner, Contacted, Needs Review, Not Relevant should save the appropriate existing backend status and advance to the next eligible creator only after successful save; Next Creator advances without a status change. If the UI fails, report it; do not claim deployment/test success from source code alone.

## Decisions made from screenshots on 2026-10-08
- @4patriotsllc — **NOT RELEVANT**. 4Patriots is a preparedness company advertising its own products. Not an independent influencer. No DM.
- @addtocartistry — **CONTACT CANDIDATE, conditional**. Bio: 'Prepping millennial, home & garden', TikTok Shop finds, UGC creator, affiliate links; ~6,432 followers in screenshot. Plausible independent UGC creator; verify relevant recent videos before DM. A personalized draft was prepared in ChatGPT, but no confirmed send was recorded.
- @adicabags — **NEEDS REVIEW**. Paramedic-owned medical/emergency bag business; ~301 followers in screenshot. Complementary business possible, but not clearly an independent creator. No DM.

These are human screening decisions from supplied screenshots, NOT proof that CRM database statuses were updated or messages sent.

## Technical handover
- Canonical repo: https://github.com/iamaseth/survivalproject-3e36645a
- Lovable project: https://lovable.dev/projects/2d7f9356-04a7-4000-bd94-816d039b0754
- Published runner: https://survivalproject.lovable.app/outreach-runner
- Route: src/routes/outreach-runner.tsx
- As inspected on 2026-10-08, GitHub source includes auto-advance after action and persistence; production deployment and live database behavior have NOT been end-to-end verified.
- Database: Lovable-managed backend. Do not infer a separate Supabase project from names. Verify identity before writes.
- AI OS instructions: https://github.com/iamaseth/ai-operating-system/blob/main/commands/LOAD-AI-OS.md and commands/CONTINUE-DEV.md. No Lovable AI/edit credits without explicit approval.
- BoBo continuation: Open same ChatGPT account, use `$bobo` or `$continue dev survival tabs influencers`, load this file and latest canonical handover, then inspect screenshot and decide relevance BEFORE drafting a DM.
- The user's explicit priority: prevent BoBo from accidentally messaging businesses, competitors, or other poor-fit leads.
