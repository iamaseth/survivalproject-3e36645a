# Amazon Creators rollout test plan

Before merging to `main`:

- Confirm the database migration is applied to the connected Supabase project.
- Confirm existing `/creators` page still loads unchanged.
- Confirm sidebar shows **Amazon Creators**.
- Open `/amazon-creators` and verify it loads with zero or existing Amazon rows.
- Add one test creator using a unique Amazon video URL.
- Add the same video URL again and verify the app reports the creator already exists instead of creating a duplicate.
- Verify 0–100 fit score validation.
- Verify Amazon storefront/video links open in a new tab.
- Verify **Open creator** links into the existing `/creators/$id` detail page.
- Verify existing Rena/Perry outreach and approval behavior remains unchanged.

Rollback: revert the feature commit(s). The database migration only adds nullable columns and can safely remain if the UI is rolled back.
