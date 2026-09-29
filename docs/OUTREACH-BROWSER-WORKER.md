# Outreach Browser Worker — Integration Contract (Phase 2, experimental)

A small local helper on the operator's Ubuntu computer. The hosted app
(`/outreach-runner`) may ask it to **Open & Paste** only. It never sends.

## Connection
- Default URL: `http://127.0.0.1:4317` (stored per-browser in localStorage key `outreach-browser-worker-url`).
- The app accepts only `http://127.0.0.1:<port>` or `http://localhost:<port>`.
- The hosted app is HTTPS; browsers may block requests to localhost / private network.
  The worker answers CORS preflights with `Access-Control-Allow-Private-Network: true`
  for the configured origin only. If the browser still blocks it, the app shows an error.
  Site security is not weakened (no CSP/mixed-content changes).

## API

### `GET /health`
`200 { "ok": true, "version": "0.1.0" }`

### `POST /open-and-paste`
Request (JSON, max 16 KB):
```json
{ "creatorId": "uuid", "platform": "TikTok|Instagram", "profileUrl": "https://www.tiktok.com/@x", "message": "..." }
```
Response:
```json
{ "success": true|false, "status": "<code>", "error": "optional human text" }
```
Status codes (`status`):
- `pasted_ready_for_review` — message pasted, Send NOT pressed (future).
- `profile_opened_paste_not_implemented` — V1: profile opened, messaging/paste not automated yet.
- `stopped_login_required`, `stopped_captcha`, `stopped_security_warning`, `stopped_account_restricted`
- `duplicate_recent_attempt` — same creatorId attempted recently.
- `invalid_request`, `host_not_allowed`, `message_too_long`, `send_forbidden`, `busy`, `internal_error`

### Forbidden
There is **no send endpoint** and none may be added in this phase. Any request body
containing `send`, `autoSend`, `clickSend` or `submit` is rejected with `send_forbidden`.
The worker must never click a Send button or press Enter in a message box.

## Safety rules
1. Use a **dedicated Chrome profile** (`USER_DATA_DIR`), never the personal profile.
2. **No credentials in GitHub.** `.env` is git-ignored; only `.env.example` is committed.
3. **No automatic Send.** The human reviews and sends.
4. **Stop immediately** on CAPTCHA, login wall, security warning or account restriction.
5. **Idempotency:** one attempt per creatorId per cooldown window (default 10 min); one job at a time.
6. **Logging:** creatorId, platform, host and status only. Never log the full message, cookies or tokens.
7. **Bind 127.0.0.1 only** by default. CORS limited to `ALLOWED_ORIGINS`.
8. Allowed hosts: `tiktok.com`, `www.tiktok.com`, `instagram.com`, `www.instagram.com`; `https:` only.
9. Message max 2000 characters.
