# Amazon Creators feature status

Branch: `feature/amazon-creators`

Implemented:
- additive Supabase migration for Amazon creator/video intelligence fields
- authenticated server functions to list, add, deduplicate, and update Amazon creator data
- `/amazon-creators` discovery page
- sidebar navigation entry
- reference link to the Survival Tabs Amazon review
- rollout/test documentation

Not yet live:
- migration has not been applied because the current ChatGPT Supabase connection does not have permission to modify/query this project
- branch has not been merged to `main`

Do not make the page live until the migration is applied and the test plan passes.
