# Outreach Browser Worker (local, experimental)

Opens a creator profile in a dedicated Chrome profile for the Outreach Runner.
**Never presses Send.** V1 opens the profile and stops (`profile_opened_paste_not_implemented`);
messaging/paste is not automated until reliable selectors are established.

Contract & safety rules: `docs/OUTREACH-BROWSER-WORKER.md`.
Not part of the app build; has its own dependencies.

## Install (Ubuntu, later)
```bash
sudo apt-get install -y nodejs npm   # need Node >= 20.6 (or use nvm)
cd automation/outreach-browser-worker
npm install
npx playwright install --with-deps chromium
cp .env.example .env                 # edit ALLOWED_ORIGINS if needed
npm run check
npm start
```
First run: log in to TikTok/Instagram manually in the window that opens (dedicated profile).
Then in `/outreach-runner` → Browser Worker → Save address → Test Browser Worker.

## Checks
`curl http://127.0.0.1:4317/health` → `{"ok":true,"version":"0.1.0"}`
