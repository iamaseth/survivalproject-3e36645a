# Contact workflow compatibility

The existing database remains authoritative. No Google Sheets connection is available; the consolidated master has NOT been read, imported, synchronized, or written. Linking a workspace-owned Sheets connection with read/write access and confirming identity/column mappings is required before changing that source.

Display compatibility (no stored values changed):
- research → Bulk Find
- ai_screened → AI Review
- approved / Manually Approved → Approved for Contact label, **not** automatic contact eligibility
- rejected with a manual rejection → Rejected; otherwise AI Rejected
- sent or existing contact/sent timestamp → Sent
- second_look → Later

The shared Rena/Seth queue requires explicit direct-profile review, dated evidence, a grounded saved DM, valid TikTok profile and no contact/rejection/opt-out. MD Applied, MD Needed and blank are independent indicators read only from explicit custom attributes; raw Markdown presence never implies MD Applied or approval.

Read-only audit: 5,091 research, 143 ai_screened, 29 approved, 15 sent, 386 rejected, 3 second_look. All 29 legacy approved have DMs but none has the existing explicit direct-review marker/date/evidence or final approval. All remain stored; the 19 with non-null TikTok links appear in the queue's collapsed Awaiting verification list, not contactable tiles. The other 10 remain in the CRM. No records were promoted or changed.

Actions use existing authenticated transactional database functions. Sent asks the user to confirm an actual external send; no send automation. Successful actions remove pending tiles immediately; failures retain them. Later and Sent use existing Undo with original restrictions. Rejected links to existing approver-only decision Undo; this does not automatically restore eligibility or all prior qualification flags. Full sender-side rejection restoration requires a separately authorized audited backend change.

The existing Sent function still records its legacy “assumed — unconfirmed” contact-method text even after user confirmation. Historical semantics were not rewritten. No database migrations or deployment changes were performed.

Verification: 16 eligibility/compatibility tests passed; automatic code/build checks passed. Signed-in as the requesting Seth account, Rena and Seth queues both showed 19 awaiting verification and zero contactable tiles. Reload retained authentication and the same list; phone-sized Chromium showed no horizontal overflow or runtime errors. There were no real eligible contact tiles, so persistent Sent/Rejected/Later/Undo actions were not exercised against live creators. No physical phone/PWA test, sends, or publication.