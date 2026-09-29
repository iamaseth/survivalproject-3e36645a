# Outreach Browser Worker — Checkpoint — 2026-09-29

This file is the durable restart checkpoint. Do not rely on ChatGPT memory for this workflow.

## Current verified state

- CRM **Ready to Contact = 490**.
- Outreach Runner **Ready = 490** after restoring its direct/sidebar fallback.
- The earlier **212** was an earlier snapshot while personalization batches were still being processed; it is not the current target.
- Personalization workflow checkpoint from the original chat: **1,393 Needs Personalization / 162 Needs Review / 490 Ready to Contact**.
- One corrected 200-person TikTok personalization batch produced **147 Ready to Contact / 53 Needs Review**.
- Do not change the CRM Ready-to-Contact classification simply to force it back to 212.
- Outreach automation is currently TikTok-first.

## Outreach Runner behavior

Route: `/outreach-runner`

Current eligible logic:
- If CRM hands off explicit IDs in the URL, use those IDs.
- Otherwise fall back to the shared Ready-to-Contact selector.
- Require TikTok URL and a non-empty personalized TikTok DM.
- Current verified direct/sidebar queue: **490**.

Important commits:
- `89fdb95` — restore original CRM Ready-to-Contact logic.
- `ef531dc` — restore Ready-to-Contact fallback in Outreach Runner.
- `63dbf9c` — add Chrome Local Network Access request support.
- `5fea29f` — correct target address space to `loopback`; worker connection then succeeded.
- `d70914d` — change worker browser strategy to attach to user Chrome over CDP.

## Local Browser Worker

Directory:
`~/survivalproject-3e36645a/automation/outreach-browser-worker`

Worker address:
`http://127.0.0.1:4317`

Health check:
```bash
curl http://127.0.0.1:4317/health
```
Expected:
```json
{"ok":true,"version":"0.1.0"}
```

The production Outreach Runner successfully reached the worker after the request used:
`targetAddressSpace: "loopback"`

Chrome may ask for permission to access local devices/services. Allow it for the Outreach Runner.

## Safety / operating rule

Current phase is **Open & Paste only**.

The worker must:
1. Open one creator profile.
2. Open the creator's messaging UI when reliable selectors are implemented.
3. Paste that creator's saved personalized DM.
4. STOP.
5. Human reviews and presses Send.

Do not auto-send in the current phase.
Do not bypass CAPTCHA, login/security warnings, restrictions, or platform protections.
Stop for human attention on any of those conditions.
Avoid duplicate contact attempts.

## Why the original Playwright browser was abandoned

The first worker used a Playwright persistent browser profile. When trying to sign in using the company Google account, Google displayed:

> Couldn't sign you in. This browser or app may not be secure.

Do not attempt to bypass that Google security check.

The worker was therefore changed to attach to a normal Chrome instance over Chrome DevTools Protocol (CDP).

## New Chrome/CDP strategy

Worker default CDP endpoint:
`http://127.0.0.1:9222`

Start a dedicated normal Chrome instance with:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-survival-outreach"
```

This must use a non-default Chrome user-data directory.

Then:
1. In that dedicated Chrome window, log into the company account/TikTok normally.
2. Leave the Chrome window open.
3. Start/restart the Browser Worker.
4. Test Browser Worker from the Outreach Runner.
5. Test **one creator only** with Open & Paste.
6. Do not send until the opened profile/message state has been inspected.

## Current stop point

The user cannot yet log into the company email/account and needs to wait.

**Resume here:** once company login is available, start the dedicated Chrome command above, log in normally, leave Chrome open, restart the worker, verify connection, and perform one creator Open & Paste test.

## Worker installation already completed

- Node: v26.7.0
- npm: 11.19.0
- `npm install` completed.
- Playwright Chromium installed.
- `npm run check` passed.
- Worker health endpoint verified.
- HTTPS production page → localhost connection issue diagnosed and fixed using loopback Local Network Access.

## Worker start

From:
`~/survivalproject-3e36645a/automation/outreach-browser-worker`

Run:
```bash
npm start
```

Keep that terminal running.

## Architecture

Survival Influencer web app / CRM
→ Outreach Runner
→ localhost Browser Worker on Ubuntu
→ dedicated normal Chrome over CDP
→ TikTok

GitHub is the durable source of truth for this workflow and checkpoint.
