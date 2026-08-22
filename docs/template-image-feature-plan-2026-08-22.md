# Email Template Image Feature — 2026-08-22

Safety checkpoint before implementation.

Goal: allow an approved email template to carry one reusable inline image (for example a Survival Tabs product image) and alt text, then apply that image when the template is used in the Gmail composer.

Rules:
- No Lovable AI/edit credits.
- Additive database changes only.
- Do not delete or overwrite existing templates.
- Existing six templates must continue to work with image fields null.
- Store image bytes in Supabase Storage; store only path/URL metadata in the template row.
- Image edits should trigger the same re-approval behavior as other template content changes.
- Test with a non-approved/template draft before using on live outreach.
