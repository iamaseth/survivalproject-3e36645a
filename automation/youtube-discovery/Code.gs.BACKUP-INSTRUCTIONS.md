# Google Apps Script Backup — Required

The live YouTube influencer discovery worker currently lives in Google Apps Script and is NOT automatically backed up by GitHub.

## Required backup procedure
1. Open the Google Apps Script project containing `runInfluencerDiscovery()`.
2. Open `Code.gs`.
3. Select all and copy the COMPLETE script.
4. Save the complete source into this repository as:
   `automation/youtube-discovery/Code.gs`
5. Never include Script Properties or plaintext secrets in the file. In particular, do not commit values for:
   - `YOUTUBE_API_KEY`
   - `INGEST_SECRET`
6. After every material Apps Script change, update the GitHub copy and include the date/change in the commit message.

## Current known state
The current live script successfully completed a full discovery run producing 850 raw search results, 784 unique channels, and 528 channels <=20K before analysis encountered a missing uploads playlist; the script was subsequently hardened to skip missing playlists. A later prepared existing-candidate import reported 540 rows. The live script is therefore valuable operational source code and must not be treated as disposable.

## Backup-before-major-change rule
Do not replace, substantially edit, or delete the live Apps Script until its complete current source has been copied to GitHub and the copy has been verified.

## Secrets
GitHub stores source only. Private Apps Script Script Properties remain private and must be separately documented by NAME only, never by value.
