# Survival Hub

survival-Tabs-Lovable-Team-Hub-Prompt-v1.0.md


# Survival Tabs Team Content Hub — Lovable Prompt v1.0

## Instructions for Seth

Open Lovable, create a new project, and paste the prompt below. Use Lovable Cloud when asked so the hub can support logins, uploads, comments, approvals, and activity history. Build privately. Perry reviews the hub before Rena, Tuan, or Hoang are invited.

## Prompt to paste into Lovable

Build a private responsive internal application called **Survival Tabs Team Content Hub**. This is a collaboration, review, and approval portal—not a public marketing website.

Use Lovable Cloud for authentication, database, file storage, comments, and activity history. Prefer managed Google sign-in. Require authentication for every page and use role-based access with row-level security.

### Core workflow

Seth creates and uploads content → Perry reviews and comments → Perry approves or requests changes → approved materials become available to the assigned team member → Rena or Tuan completes the work → asset moves to Published or Archived.

Nothing is distributed to the wider team before Perry approves it.

### Roles

- **Seth — Owner/Admin:** create, edit, upload, assign, submit for review, resolve comments, manage users and archives.
- **Perry — Boss/Approver:** review all submitted assets, comment, approve, or request changes. Requesting changes requires a comment.
- **Rena — Influencer Coordinator:** access only approved creator/outreach/social/sample materials; contact approved leads; update replies, follow-ups, samples, and received content.
- **Tuan — Technical Implementation:** access approved website, Shopify, affiliate, Klaviyo, SEO implementation, and technical materials; upload staging links, screenshots, product assets, and implementation updates.
- **Hoang — Team Member:** read/comment only; display “Responsibilities pending confirmation” until Seth assigns a final role.

Create an Admin invitation screen where Seth invites users by email and assigns roles. Do not display personal emails publicly.

### Status workflow

Every asset has one status:

- Draft
- Ready for Boss Review
- Changes Requested
- Boss Approved
- Sent to Team
- In Production
- Published
- Archived

Only Seth submits Draft assets for review. Only Perry can approve or request changes. Record approver, approval date, and version. A materially revised approved asset returns to Ready for Boss Review.

### Navigation

- Dashboard
- Needs Boss Review
- Decisions Needed
- Assets
- Influencer Leads
- Website & Shopify
- Video Production
- SEO & Articles
- Email & Klaviyo
- Team Actions
- Comments
- Published Archive
- Admin

### Dashboard

Show:

- Primary objective: **Drive qualified traffic and measurable sales to TheSurvivalTabs.com and approved Amazon listings.**
- Next priority: Review and approve the first five qualified creator leads for Rena.
- Status counts
- Five most urgent assets awaiting Perry
- Decisions needed
- Tasks grouped by Seth, Perry, Rena, Tuan, and Hoang
- Recent activity

Seed these decisions:

- Maximum samples for initial test
- Shipping markets
- Customer discount
- Creator commission
- Affiliate attribution period
- Paid UGC budget
- Organic reuse-rights period
- Paid-advertising rights budget
- Amazon listings included
- Hoang's final role

### Assets

Each asset needs title, description, category, owner, assignee, status, priority, version, created/updated/due dates, approval details, attachment or external link, “what this produces,” next action, related assets, comments, and activity history.

Support Markdown, PDF, Word, Excel, images, MP4/video, ZIP, and external URLs. Provide safe preview where possible plus download.

Asset categories:

- Creator & Affiliate Program
- Website Copy
- Website Technical
- Video Production
- SEO & Articles
- Email & Klaviyo
- Claims & Compliance
- Product Assets
- Images & Brand
- Amazon
- Team Operations

Every asset page includes comments with replies and resolved status, version history, activity timeline, upload-new-version, and Perry-only Approve and Request Changes buttons.

### Influencer Leads

Create a sortable, filterable table with:

- Priority
- Creator
- Platforms
- Profile URL
- Niche
- Why they fit
- Public contact route
- Specific post to mention
- Outreach angle
- Suggested video concept
- Verification notes
- Review decision
- Outreach status
- Rena notes
- Sample status
- Affiliate link
- Discount code
- Content deadline
- Content received
- Post URL
- Views, clicks, orders, and revenue
- Reuse rights
- Next action

Lead-review values: Researching, Hold, Approved for Rena, Rejected.

Only leads marked **Approved for Rena** appear in Rena's outreach queue.

Outreach values: Not Contacted, Contacted, Follow-up 1, Follow-up 2, Interested, Terms Pending, Approved, Sample Shipped, Content Pending, Content Received, Posted, Strong Performer, Do Not Renew.

Allow validated CSV/Excel import and export.

### Initial asset records

Seed placeholder records marked Ready for Boss Review. Do not invent file contents; Seth uploads the actual files:

1. Survival Tabs UGC Creator Kit v1.0
2. Survival Tabs Creator Brief v1.0
3. Survival Tabs Accelerated Affiliate and Creator Campaign v1.0
4. Survival Tabs Influencer Leads v1.0
5. Survival Tabs Approved Claims and Product Fact Sheet v1.0
6. Survival Tabs Homepage Copy Package v1.0
7. Survival Tabs Homepage Video Package v1.0
8. Survival Tabs 72-Hour Emergency Kit Lead Magnet Package v1.0

### Initial tasks

- Seth — Approve first five creator leads — High — Not Started
- Seth — Send review package to Perry — High — In Progress
- Rena — Review lead and outreach workflow — High — Waiting
- Tuan — Confirm Shopify Collabs and tracking — High — Not Started
- Perry — Approve samples, commission, discount, and UGC budget — High — Not Started
- Hoang — Confirm role — Medium — Waiting

### Comments and notifications

Allow comments on assets, leads, decisions, and tasks. Support replies, @mentions, unread counts, and resolved comments. Send email notifications only for assignments, direct mentions, approval decisions, and change requests.

### Design

Use deep forest green, warm cream, muted olive, small antique-gold accents, neutral gray text, accessible contrast, clean cards, readable tables, and generous white space. Avoid camouflage, military styling, fear-based imagery, disaster imagery, and clutter.

### Security

Require authentication. Keep files private. Validate files. Record uploads, approvals, comments, role changes, and archives. Use archive/soft delete for normal users. Only Seth manages users and archived records. Run Lovable's security scan before publishing.

### Build order

1. Build the responsive front end with mock data.
2. Show Seth the dashboard, assets, leads, tasks, and review screens.
3. After the front end is approved, connect Lovable Cloud.
4. Add authentication and roles.
5. Add database and row-level security.
6. Add file uploads, comments, approvals, notifications, and activity history.
7. Add CSV/Excel lead import/export.
8. Test desktop and mobile.
9. Run security scan.
10. Provide a private preview. Do not make the hub public and do not invite team members yet.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://survivalproject.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2d7f9356-04a7-4000-bd94-816d039b0754).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
