# Hotfix — Gmail background polling disabled when service-role env is unavailable

Date: 2026-08-12

## Symptom
Lovable runtime blank screen caused by the automatic Gmail background poller calling server functions that require `SUPABASE_SERVICE_ROLE_KEY` in the Lovable runtime.

## Decision
Disable only the app-wide automatic Gmail poller and Gmail health banner. Gmail settings/send code remains in the repository and can be restored after the Lovable Cloud service-role environment is correctly available.

## Why
Amazon Creator Discovery does not depend on Gmail. A nonessential background integration must not make the entire CRM unavailable.

## Restore later
Re-enable `pollGmailForReplies` and `GmailHealthBanner` in `src/components/AppShell.tsx` after confirming `SUPABASE_SERVICE_ROLE_KEY` is available to server functions in the deployed Lovable environment.
