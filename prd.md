# Audits.run PRD

## Product summary

Audits.run is an agent-first SEO and AI readiness audit platform built around the existing `seo` core engine.

The product gives humans clear, plain-English reports and gives AI agents structured data, stable report ids, raw evidence, and remote MCP tools. The hosted app should feel simple enough for a founder to use without training, but detailed enough for an SEO consultant or coding agent to audit and improve a real site.

The current CLI and local MCP package stay valuable. The SaaS should wrap the same engine instead of replacing it, so a future local or self-hosted release can still exist without rewriting the product.

## Primary goals

- Build a hosted SaaS at `audits.run`.
- Use Astro for the web app, public site, dashboard, API routes, OAuth pages, and remote MCP endpoint.
- Run on the VPS stack with Postgres, Docker, Caddy, Cloudflare in front, and a separate background worker.
- Keep the existing `packages/core` SEO engine as the source of truth.
- Let remote MCP clients authenticate through a real Audits.run account.
- Make every expensive audit operation job-based and idempotent.
- Serve public pages as designed HTML for humans and Markdown for agents.
- Keep the product useful without third-party SEO databases, scraping APIs, SEMrush, Ahrefs, or rank-tracking vendors.

## Non-goals for v1

- No keyword database.
- No rank tracking.
- No backlink index.
- No SERP feature tracking.
- No AI answer visibility tracking across ChatGPT, Claude, or Perplexity.
- No desktop app.
- No public open-source release requirement.
- No arbitrary marketing limits in the local/core engine.
- No CAPTCHA.

## Product positioning

Audits.run is the data layer for technical SEO and AI readiness work.

It should answer:

- What is broken?
- Why does it matter?
- Which pages are affected?
- What should I fix first?
- What changed since the last audit?
- What can an agent safely do with this data?
- What evidence supports the recommendation?

The product is closer to an agent-native technical SEO testing and audit platform than a classic SEO suite. It should use first-party crawl data, Search Console, Analytics, snapshots, and repeatable reports rather than paid third-party datasets.

## Users

### Founder or indie operator

Wants to know what to fix to get more search and AI discovery traffic. Needs simple reports and clear next actions.

### SEO consultant

Works across client sites. Needs repeatable audits, history, exports, and a way to hand evidence to clients or agents.

### AI coding agent

Needs stable tools, compact JSON, report ids, raw evidence, and clear scopes. Should be able to run audits, inspect reports, compare snapshots, and create implementation plans.

### Internal operator

Needs job visibility, account limits, error logs, and a way to diagnose failed crawls without digging through raw container logs.

## Current engine

The current repo already contains most of the heavy audit work:

- Crawl engine.
- Shared rule registry.
- Technical SEO rules.
- AI and GEO readiness rules.
- GSC and GA4 joins.
- Content optimization reports.
- Lighthouse and fallback performance reports.
- Saved crawl reports.
- Snapshot comparison.
- OKF and site knowledge exports.
- CLI commands.
- Local MCP tools.
- Plain-English fix guidance.
- Structured JSON for agents.

The hosted app should consume this through `packages/core`. The SaaS app should not copy engine code into a separate implementation.

## Hosted product modules

The SaaS should expose the current engine as a small number of clear product modules.

### Site audit

The main product surface. Runs the crawler, joins available first-party data, ranks fixes, and creates the human and agent report.

### Technical watch

Repeatable crawl and index monitoring. Shows what changed since the last run, what got worse, what was fixed, and what needs attention now.

This is also the weekly retention loop. The product should make a user feel that something useful arrived every week: what improved, what regressed, what changed, and what to do next.

### Change testing

Hosted version of local SEO tests. Lets a user record a dated change, such as title tags, content, internal links, schema, templates, or sections, then measure before and after impact with GSC and optional GA4.

This should stay a data workflow, not full SEO split-testing infrastructure. The product can support control groups and comparison windows, but it does not need to manage traffic allocation or page variant rollout.

### Content opportunities

Turns GSC demand and crawled page content into a practical brief. It should suggest title, H1, meta description, section, entity, schema, and internal-link improvements, then expose the raw opportunity data for agents.

### AI readiness

Scores whether the site is easy for AI systems and agents to crawl, understand, summarize, cite, and use. This includes entity readiness, llms.txt, OKF, schema, semantic structure, author/date signals, answer-ready sections, and agent resource discovery.

### Performance

Runs Lighthouse where available, uses a lightweight fallback when not, and optionally joins CrUX field data when the hosted app has a configured API key.

### Knowledge exports

Creates agent-readable site knowledge in OKF, Markdown, JSON, and `llms.txt` formats. Exports should be downloadable by humans and readable through MCP/API by agents.

### Raw data

Keeps low-level GSC, GA4, URL inspection, crawl snapshot, and report slice APIs available for agents and advanced users.

## Codebase strategy

Preferred early shape:

```txt
~/dev/cli/seo
  packages/core
  packages/cli
  packages/mcp

~/dev/apps/audits
  astro app
  web routes
  api routes
  mcp routes
  worker entry
  database migrations
  deploy scaffold
```

The Audits app should depend on the SEO engine as a local workspace, private package, or git dependency. The dependency method can change later. The contract should not.

The core engine should remain environment-neutral:

- No hosted-only auth inside core.
- No SaaS billing logic inside core.
- No Postgres assumptions inside core unless behind adapters.
- No direct dependency on Astro.
- No direct dependency on MCP transport.

The SaaS owns:

- Users.
- Accounts.
- Billing.
- OAuth.
- Remote MCP auth.
- Job queue.
- Hosted persistence.
- Hosted rate limits.
- Hosted report history.

## Deployment shape

Use the VPS app blueprint as the base.

Target app path:

```txt
~/dev/apps/audits
```

Before bootstrap, confirm whether the local `vps` inventory should point directly at this path or whether the app should also exist under the usual `~/dev/web/<name>` convention. The app inventory can make the real path explicit if the tooling supports it.

Required production scaffold:

- `Dockerfile`
- `docker-compose.prod.yml`
- `Caddyfile`
- `.env.example`
- health endpoint at `/healthz/`
- readiness endpoint at `/readyz/`
- migration command
- seed command if needed
- GitHub deploy workflow
- deploy cleanup using `vps-docker-cleanup audits`

Runtime services:

```txt
web
  Astro SSR app
  public pages
  dashboard
  API routes
  OAuth routes
  MCP endpoint

worker
  pg-boss workers
  crawls
  GSC sync
  GA4 sync
  Lighthouse jobs
  report generation
  exports

postgres
  app data
  jobs
  report metadata
  OAuth tokens
```

Use Cloudflare in front of the VPS. Caddy should import the shared Cloudflare allowlist and reject unexpected host headers.

## Route strategy

Keep the public site simple.

Prerender finite public pages where possible:

- homepage
- pricing
- docs landing pages
- methodology pages
- changelog pages if static
- legal pages

Keep live routes SSR:

- dashboard
- login
- OAuth authorization pages
- account settings
- project pages
- report pages
- API routes
- MCP endpoint

Generate sitemap XML files into `public/` rather than relying on dynamic Astro XML routes.

## Agent-first public content

Every public URL should support both human HTML and agent-friendly Markdown.

HTML is the default for normal browsers.

Markdown should be returned when one of these is present:

- `Accept: text/markdown`
- `?format=markdown`
- a matching `.md` route where it makes sense, such as `/docs/mcp.md`

The same page content model should feed both renderers. Do not maintain separate copy for HTML and Markdown unless the page genuinely needs a different shape.

Markdown responses should:

- use semantic headings
- avoid navigation chrome
- include canonical links where useful
- include short code examples where relevant
- include links as plain Markdown links
- use `text/markdown; charset=utf-8`

HTML pages should:

- use Astro layouts and components
- stay calm and task-focused
- avoid decorative card rows and marketing filler
- make the first screen useful

This pattern should become a reusable agent-first SaaS blueprint later.

## Visual direction

The product should look like a serious data tool, not a venture-backed marketing site.

Reference direction:

- narrow content column, roughly Tailwind `max-w-xl`
- lots of whitespace
- neutral background
- restrained borders
- simple tables
- small sparklines
- compact charts
- minimal navigation
- no decorative gradients
- no heavy hero art
- no oversized dashboard chrome

Typography:

- body: Inter, system UI, Apple system, Segoe UI, Arial, sans-serif
- headings: consider Literata Variable with Iowan Old Style, Charter, Georgia, Times New Roman fallback
- numbers and compact labels: a readable mono face with tabular numbers

Components should be built with Tailwind and can use Kiwa Astro as the starting point where useful. Converted Kiwa components should be treated as scaffold, then simplified into the Audits.run design language.

UI rules:

- use one main content column for marketing, docs, onboarding, and report reading
- use wider layouts only when data genuinely needs it
- use compact tables for issue lists, affected URLs, jobs, reports, and exports
- use tiny grayscale sparklines for trend context
- use restrained green, amber, red, and blue only when they carry meaning
- prefer text, tables, and evidence over decoration
- keep cards rare and flat
- make the report page feel like a readable document with useful data blocks
- do not hide the product behind a generic landing page

The visual feel should be close to a calm technical field report: plain, fast, readable, and precise.

## Report UI

Users still need a first-class web report, even if the product is agent-first.

The report should be the main designed surface of the app.

Report layout:

- narrow summary at the top
- health scores and key changes
- top fixes table
- issue sections
- affected URL tables
- simple trend blocks
- evidence drawers or detail pages
- exports
- MCP/API references

Report components:

- score row
- top fix row
- affected URL row
- issue evidence block
- before/after change block
- tiny sparkline
- severity marker
- data caveat line
- command/API/MCP reference block

The report should always answer:

- what happened
- why it matters
- what to fix first
- how to verify the fix
- what data was missing
- what changed since the previous report

Agents should be able to fetch the same report as compact JSON or Markdown. Humans should get the same underlying data in a calm Astro HTML view.

## Authentication

Audits.run should have normal account login for humans and OAuth-based authorization for MCP clients.

Human app auth:

- email/password or magic link
- session cookie
- CSRF protection for unsafe methods
- account and project selection inside the app

Remote MCP auth:

- MCP client connects to `https://audits.run/mcp`
- client discovers OAuth metadata
- client opens `https://audits.run/authorize`
- user signs into Audits.run if needed
- user approves MCP access
- server issues access and refresh tokens
- MCP tools run with scoped user/account context

MCP requests should not depend on browser cookies. Cookies are only for the login and authorize pages. Tool calls should use bearer tokens.

Users need a connected MCP clients page:

- list authorized MCP clients
- show scopes
- show created date
- show last used date
- revoke a client
- revoke all clients for an account

Suggested OAuth scopes:

- `audits.read`
- `audits.run`
- `audits.write`

Start conservative. Most tools should be read-only or job-starting. Destructive account operations should not exist in MCP v1.

## Remote MCP v1

The remote MCP server should be a thin authenticated control layer.

It should:

- validate token
- resolve user, account, scopes, and plan
- enforce project and account access on every tool call
- enqueue jobs
- return compact job and report references
- expose report slices and structured evidence
- avoid long-running work inside MCP requests
- return plain Markdown summaries only when requested
- return stable JSON by default for tools

Initial tools:

- `whoami`
- `list_projects`
- `create_project`
- `get_project`
- `start_site_audit`
- `start_crawl`
- `start_technical_watch`
- `start_change_test`
- `start_ai_readiness_audit`
- `start_content_audit`
- `start_performance_audit`
- `get_job_status`
- `list_reports`
- `get_report`
- `get_report_summary`
- `get_affected_urls`
- `compare_reports`
- `export_knowledge`
- `generate_llms_txt`
- `get_google_connection_status`

Tool output should default to compact JSON. Full evidence should be opt-in.

Long crawls should return immediately:

```json
{
  "job_id": "job_123",
  "report_id": "rep_123",
  "status": "queued",
  "poll_after_seconds": 5
}
```

## Background jobs

Use Postgres-backed jobs, likely `pg-boss`, for hosted work.

Job types:

- crawl site
- audit URL list
- GSC sync
- GA4 sync
- URL inspection
- content audit
- AI readiness audit
- Lighthouse audit
- CrUX sync
- technical watch
- change test measurement
- weekly digest generation
- email send
- report generation
- report comparison
- llms.txt generation
- OKF export
- Markdown export
- JSON export

Jobs should be idempotent where practical.

The same audit request against the same account, project, config hash, data freshness window, and engine version should reuse or reference existing output instead of doing unnecessary work.

Job records should include:

- account id
- user id
- project id
- job type
- status
- progress
- input hash
- engine version
- started at
- finished at
- error summary
- retry count
- linked report id
- timeout at
- cancelled at

Job states:

- queued
- running
- completed
- partial
- failed
- cancelled
- timed out
- reused

No job should be able to sit in `running` forever. Every worker job needs a timeout, heartbeat, and terminal failure path. The web UI should always show a clear terminal state instead of an endless spinner.

Users and agents should be able to cancel running jobs. Cancelled jobs can keep partial artifacts where useful, but they must not be treated as completed reports.

## Data model

Core tables:

- users
- accounts
- account_members
- sessions
- oauth_clients
- oauth_tokens
- mcp_authorized_clients
- projects
- project_sites
- google_connections
- crawl_jobs
- reports
- report_artifacts
- crawl_snapshots
- page_snapshots
- issue_groups
- technical_watch_runs
- change_tests
- change_test_measurements
- google_data_snapshots
- knowledge_exports
- weekly_digests
- email_preferences
- email_events
- usage_events
- plan_limits
- audit_events
- billing_customers
- subscriptions

Store large report artifacts separately from report metadata if needed. Postgres JSONB is fine for v1, but the schema should allow moving large artifacts to object storage later.

## Tenant boundaries

Every private record must be scoped by `account_id`.

This includes:

- projects
- Google connections
- OAuth tokens
- MCP tokens
- jobs
- reports
- report artifacts
- crawl snapshots
- weekly digests
- email preferences
- usage events
- audit logs

Core access rule:

- every read checks account membership
- every write checks account role
- every background job reloads account/project permissions before doing work
- every MCP tool runs with explicit account context
- no report id, artifact id, job id, or export id should bypass account checks

## Accounts, teams, and clients

The v1 data model should include accounts and membership from the start, even if the first UI is mostly single-user.

Roles:

- owner
- admin
- member
- read-only

Project-level client access can come later, but the schema should not block it.

Agencies need multiple projects across different clients. Enterprise users need team members, access control, and audit history. If this is bolted on later, it will be painful, so account membership should be part of v1.

## Onboarding

The first-run product path should be short.

Recommended flow:

1. Create account.
2. Connect a Google account.
3. Pick a Search Console property.
4. Create project from the verified property.
5. Connect GA4, or skip it.
6. Confirm crawl settings.
7. Run first audit.
8. Land on the report.
9. Offer MCP setup from the report page.

Do not ask users to understand GSC properties, GA4 property ids, crawl depth, or API keys during first run. The app should detect sensible defaults and let advanced users change them later.

For the hosted product, GSC access is the site verification method. If a user cannot connect read-only Search Console access for a site, do not allow a hosted crawl for that site.

GA4 should remain optional. The report should explain which analytics sections were skipped and what connecting GA4 would add.

## Scheduled audits and alerts

Hosted scheduled audits are part of the SaaS value. They do not belong in the local engine.

V1 should support:

- manual audit runs
- weekly scheduled audit per project on paid plans
- technical watch report after each scheduled crawl
- email alert when high-severity issues newly appear
- email alert when a crawl fails
- dashboard notification for changed health score

Later:

- daily schedules
- Slack/webhook alerts
- custom alert rules
- per-section schedules, such as performance weekly and crawl monthly

Agents should be able to inspect scheduled run history, but creating schedules through MCP can wait until account safety and billing controls are stable.

## Weekly digest and retention

Weekly reporting is a core product loop, not a notification extra.

Every active project should be able to run a weekly audit and produce a digest that is visible in the dashboard and optionally sent by email. The digest should compare the latest report against the previous comparable report and explain what changed in plain English.

The current CLI/core already has useful foundations:

- saved crawl reports
- `compareCrawlReports`
- crawl diff summaries
- technical watch workflow
- local schedule output
- monthly/report narrative generation
- change measurement reports

The hosted product still needs a first-class digest builder that combines those pieces into one weekly object. This should probably live in the shared engine so the CLI, hosted app, MCP, dashboard, and emails use the same interpretation.

Digest inputs:

- latest crawl report
- previous crawl report
- technical watch run
- GSC week-over-week metrics
- GA4 week-over-week metrics when connected
- active change tests
- previous recommendations
- resolved or still-open top issues

Digest output:

- headline
- score changes
- search movement
- traffic movement
- new issues
- fixed issues
- changed pages
- top wins
- top regressions
- recommendations carried forward
- recommendations completed or no longer relevant
- next actions
- caveats
- report links
- structured JSON for agents
- Markdown for email, MCP, and agent reads

The weekly digest should answer:

- What is up?
- What is down?
- What changed?
- What got fixed?
- What new problems appeared?
- Did last week's recommended work help?
- What should I do this week?

This is the thing that makes the product sticky. If users get a useful weekly report, they keep connecting the product to real SEO work instead of treating it as a one-off audit.

## Email product

Use email carefully. The product should send useful reports, not noisy lifecycle spam.

Provider and rendering:

- use Resend for v1 delivery
- use React Email for templates
- render both simple HTML and plain text
- start within Resend's free monthly allowance where possible
- track sent email count as usage
- keep the provider adapter thin so delivery can move later

Required email types:

- email verification
- password reset or magic link
- weekly project digest
- audit completed
- audit failed
- new high-severity issue
- Google connection broken
- billing and subscription emails
- account invitation

Weekly digest email:

- short subject with the project name and main movement
- one clear headline
- three to five bullets
- key score changes
- top win
- top regression
- one primary action
- link to full report
- link to notification settings

Do not put the whole report in the email. The email should get the user back to the web report.

Email preferences:

- per account and per project
- weekly digest on or off
- alert emails on or off
- billing emails always on where legally required
- unsubscribe link on non-transactional emails
- digest day and timezone

Deliverability:

- configure SPF, DKIM, and DMARC
- send from a stable domain such as `updates@audits.run`
- use a separate reply/support address
- log provider message ids
- track bounce, complaint, and suppression state
- do not send marketing emails until the core report emails are valuable

Email templates should use the same digest object as the dashboard. The email HTML can be minimal: narrow column, readable type, no image-dependent layout, one clear action.

## Project model

A project is the hosted version of a local project profile.

It should contain:

- name
- primary site URL
- canonical host preferences
- crawl defaults
- connected GSC property
- connected GA4 property
- report history
- saved exports

Project pages should start from the latest useful result, not an empty dashboard.

## Reports

Reports need two representations.

Human report:

- plain-English summary
- top fixes
- why it matters
- affected pages
- how to fix
- how to verify
- caveats
- next useful actions

Agent report:

- stable ids
- rule ids
- issue codes
- severity
- confidence
- evidence
- affected URLs
- normalized metrics
- links to raw slices
- config hash
- engine version

Reports should be immutable once completed. New runs create new reports. Comparisons link two reports together.

Report pages should include:

- executive summary
- top fixes
- technical issues
- content opportunities
- AI readiness
- performance
- Google data caveats
- changed since last report
- exports
- MCP/API references

Every report should expose:

- human HTML
- Markdown summary
- compact JSON
- full JSON artifact
- CSV issue export
- CSV page export

The report UI should never force a user to understand every rule. It should start with the few fixes most likely to matter.

## Weekly report UI

The weekly report page should be separate from the full raw audit report.

It should be the human summary for a week:

- project
- report window
- previous comparison window
- headline
- score movement
- search movement
- traffic movement
- fixes shipped or detected
- regressions
- changed pages
- recommended work this week
- caveats

It should link into:

- full audit report
- crawl diff
- affected URLs
- change tests
- Google data evidence
- MCP/API JSON

The page should be shareable inside the logged-in account and readable as Markdown for agents.

## Sharing and exports

Reports should be private by default.

Sharing options:

- internal account access
- temporary signed share link
- disable share link
- delete share link
- share human HTML report
- share Markdown report
- exclude GSC/GA4 detail from shared views when needed

Consultants need client-ready report links. The first version can keep this simple with signed links and clear expiry controls.

Exports:

- full JSON
- compact JSON
- Markdown
- CSV issues
- CSV pages
- OKF bundle
- `llms.txt`

Users should be able to export their account/project data later. This does not need to be fancy in v1, but the data model should not trap user data in unexportable shapes.

## Idempotency

Idempotency is a product feature.

Use stable hashes for:

- project id
- audit config
- crawl seed set
- selected integrations
- date ranges
- engine version
- rule registry version

Before enqueueing expensive work, check for a fresh compatible report.

Possible response:

```json
{
  "status": "cached",
  "report_id": "rep_123",
  "generated_at": "2026-06-22T10:00:00Z",
  "fresh_until": "2026-06-22T22:00:00Z"
}
```

Users should not need to understand the cache. Agents should see exactly why a report was reused.

## Google integrations

Use OAuth for GSC and GA4.

The hosted app should not ask normal users to create their own Google API credentials.

Store tokens encrypted. Support disconnecting Google data.

Users must be able to connect multiple Google accounts. Agencies and companies often have different sites in different Search Console and Analytics accounts.

Connection rules:

- one account can have many Google connections
- one project can select one GSC property from any connected Google account
- one project can select one GA4 property from any connected Google account
- users can add, refresh, disconnect, and relink Google accounts
- disconnecting a Google account should show which projects will lose data
- tokens should be scoped and stored per connected Google account, not globally

Google-backed jobs:

- GSC page metrics sync
- GSC query metrics sync
- GA4 landing page sync
- GA4 conversion or event sync where configured
- URL inspection for selected URLs
- AI referral evidence from GA4

The crawl should not make one Google call per URL. Use batched date range queries, cache source data, and join locally where possible.

Google data should be snapshotted per account, project, date range, and source query hash so reports remain reproducible even if later Google data shifts.

## Site verification and crawl eligibility

Hosted crawls are only allowed for sites verified through Google Search Console.

Rules:

- read-only GSC access is enough
- domain properties and URL-prefix properties are both allowed
- a project crawl URL must match the selected GSC property
- scheduled crawls require active GSC access
- if GSC access is lost, pause scheduled crawls and show a reconnect action
- if a user wants to audit a site without GSC, they can use a future local/self-hosted tool, not the hosted SaaS

This keeps abuse risk low and keeps the product focused on users who can get real value from GSC-backed audit data.

## Google OAuth verification

For private testing, Google verification can likely be deferred by using a testing project and known test users.

For a public hosted SaaS, plan for verification work if the app asks arbitrary users to connect GSC or GA4. The likely minimum scopes are:

- `https://www.googleapis.com/auth/webmasters.readonly`
- `https://www.googleapis.com/auth/analytics.readonly`

Use the narrowest read-only scopes possible. Do not request write scopes.

Brand verification is separate from sensitive-scope review. If the app only used non-sensitive scopes, adding a public app name and logo could still require lighter brand verification. GSC and GA4 data access may need more than that because they access user data.

Do not block the product build on this immediately. Treat it as a pre-public launch task:

- configure Google OAuth consent
- verify `audits.run` as an authorized domain
- publish homepage, privacy policy, and support contact
- prepare a short demo video showing the Google connection flow and how data is used
- keep development and production Google OAuth projects separate

## AI discovery boundaries

The product should be honest about AI search.

V1 should measure readiness and evidence:

- can crawlers access the site
- can agents find the right pages
- does the site expose structured knowledge
- does the content answer real queries clearly
- are entities connected to official sources
- does GA4 show known AI referral traffic
- can GSC demand be converted into AI-monitoring prompts

V1 should not claim to prove visibility in ChatGPT, Claude, Perplexity, Gemini, or AI Overviews.

Future AI visibility tracking could become a separate product layer because it needs prompt scheduling, answer capture, citation extraction, model/provider variance, competitor tracking, and higher infrastructure cost.

## Pricing and limits

Do not design arbitrary limits into the engine.

Hosted limits should exist because hosted compute and storage cost money:

- number of projects
- crawl pages per month
- concurrent jobs
- report history retention
- scheduled audits
- Lighthouse runs
- Google data lookback
- team seats

The local/core engine should stay complete. Hosted billing controls live in the SaaS layer.

Possible future pricing:

- free private beta for selected users while costs are measured
- starter around $25 per month for one site
- growth around $50 per month for three sites
- consultant around $100 per month for ten sites
- agency or enterprise by conversation when users need many sites, team controls, higher crawl volume, or longer retention

Do not freeze pricing in product copy until the costs are measured.

Pricing should roughly scale with real costs:

- pages crawled
- Lighthouse runs
- Google data sync volume
- report storage
- scheduled jobs
- team seats
- support load

Cost controls mean both internal and customer-facing controls.

Internal:

- estimate cost per job
- track pages crawled
- track Lighthouse runtime
- track Google API calls
- track emails sent
- track report storage size
- track worker runtime
- alert when an account becomes unusually expensive

Customer-facing:

- show plan usage clearly
- show reset dates
- explain why a limit exists
- return structured limit errors to MCP/API clients
- avoid surprise hard failures where a partial result would be useful

Possible package shape:

### Free or trial

- one project
- one or two manual audits
- limited report history
- no scheduled audits
- remote MCP enabled enough to prove the workflow

### Starter

- one project
- monthly page budget
- manual audits
- weekly scheduled audit
- report history
- remote MCP

### Growth

- three projects
- higher page budget
- more history
- more Lighthouse runs
- scheduled audits
- exports

### Consultant

- ten projects
- higher concurrency
- longer retention
- team seats
- client-ready exports
- priority queue within reason

Avoid charging by every small feature. The main paid levers should be projects, crawl volume, history, schedules, and team use.

## Usage accounting

Track usage from day one, even before billing is live.

Usage events:

- audit started
- pages crawled
- external links checked
- Lighthouse run
- GSC sync
- GA4 sync
- URL inspection call
- report stored
- export generated
- MCP tool call
- weekly digest generated
- email sent

Usage should power:

- cost estimates
- plan enforcement
- abuse detection
- pricing decisions
- account admin views

When a limit is hit, the product should explain the practical reason and show the next useful option. Agents should receive a structured limit error with the limit name, current usage, reset date, and upgrade path.

## Dashboard v1

Keep the dashboard boring and useful.

Essential screens:

- projects
- project overview
- latest report
- latest weekly digest
- report history
- job status
- issue detail
- affected URLs
- compare reports
- Google connections
- MCP connection instructions
- scheduled audits
- change tests
- exports
- email preferences
- usage
- account settings

Avoid a heavy analytics dashboard in v1. The report should be the product.

## Public site v1

Pages:

- `/`
- `/pricing/`
- `/docs/`
- `/docs/mcp/`
- `/docs/google/`
- `/docs/reports/`
- `/docs/whitelist-crawler/`
- `/docs/ai-readiness/`
- `/docs/okf/`
- `/docs/agents/`
- `/methodology/`
- `/login/`
- `/app/`

Every public content route should support Markdown negotiation.

## Security

Baseline:

- Cloudflare proxy in front
- Caddy Cloudflare allowlist
- bad host rejection
- secure session cookies
- CSRF protection
- rate limits on auth, API, and MCP
- encrypted Google tokens
- per-account access checks on every report and job
- audit logs for MCP job starts
- no secrets in report payloads

MCP-specific:

- require OAuth tokens
- scope every tool
- log tool calls
- do not expose raw credentials or local paths
- label crawled page content as untrusted evidence
- avoid destructive tools in v1

Crawler-specific:

- require active GSC verification before hosted crawling
- always respect robots.txt in hosted mode
- bound crawl concurrency
- bound external link checking
- protect against SSRF
- block private IP ranges
- set request timeouts
- use a stable Audits.run crawler user agent
- keep default concurrency polite enough for small sites
- detect likely bot blocking, WAF blocks, and repeated 403 responses
- stop early when a domain is clearly blocking the crawler

Crawler identity:

- use a clear bot name such as `AuditsRunBot`
- include a docs URL in the user agent
- publish crawler IP/range guidance if the VPS setup can make that stable
- publish `/docs/whitelist-crawler/`

When a crawl appears blocked:

- mark the job as failed or partial with a clear reason
- show a dashboard notification
- send an email if alert emails are enabled
- link to the crawler whitelist docs
- do not keep retrying aggressively

## Observability

Needed from day one:

- job status
- job logs
- failed job summaries
- crawl progress
- report generation timings
- Google API usage summaries
- MCP tool call audit log
- basic app health
- usage events
- slow crawl diagnostics
- Google token refresh failures
- email send status
- email bounce and complaint status

Nice later:

- per-account cost estimates
- worker queue depth charts
- crawl throughput metrics
- report freshness alerts

## Admin and support

Add a small internal admin surface before charging money.

Admin needs:

- search users
- view accounts
- view projects
- view active jobs
- retry failed jobs
- view report metadata
- view usage
- view Google connection status without exposing tokens
- view weekly digest status
- view email delivery status
- disable abusive accounts
- grant temporary higher limits

Support needs:

- account id
- project id
- job id
- report id
- visible error summary
- last successful sync
- last successful crawl
- last weekly digest
- last email delivery status

Do not make support depend on shell access to the VPS.

## Data retention and deletion

Define retention before launch.

Suggested defaults:

- active subscription keeps report history according to plan
- free or trial accounts keep short history
- deleted projects remove private report data after a grace window
- disconnected Google integrations delete refresh tokens immediately
- account deletion queues full private data deletion

Reports and exports may contain private crawl evidence. Treat them as account data, not public assets.

## Legal and trust

Needed before paid launch:

- terms
- privacy policy
- acceptable use policy for hosted crawling
- cookie notice if needed
- data processing wording for Google data
- support email
- security contact
- clear statement that audits are recommendations, not guaranteed rankings
- clear statement that hosted crawls require verified GSC access
- crawler whitelist documentation

Google OAuth verification may be needed depending on scopes and public launch status. Plan time for this rather than treating it as a launch-day detail.

## Migration from current CLI

Phase 1 should not rewrite the engine.

Steps:

- make `packages/core` cleanly consumable by the hosted app
- add hosted storage adapters where local storage assumptions remain
- add Postgres report store
- add a shared weekly digest builder from report diffs, monitoring, GSC, GA4, and change tests
- add job-safe crawl execution wrapper
- add SaaS project model mapped to local project profile concepts
- keep CLI behavior stable while hosted app work happens

## Build phases

### Phase 1: SaaS scaffold

- [ ] Create `~/dev/apps/audits`.
- [ ] Scaffold Astro SSR app.
- [ ] Add VPS scaffold files.
- [ ] Add Postgres.
- [ ] Add migrations.
- [ ] Add health and readiness routes.
- [ ] Add basic public pages.
- [ ] Add Markdown negotiation for public routes.

### Phase 2: Auth and accounts

- [ ] Add user accounts.
- [ ] Add sessions.
- [ ] Add account membership.
- [ ] Add roles for owner, admin, member, and read-only.
- [ ] Add project creation.
- [ ] Add Google OAuth connection placeholders.
- [ ] Add multiple Google connections per account.
- [ ] Add GSC-based site verification.
- [ ] Add basic admin account view.

### Phase 3: Engine integration

- [ ] Depend on the SEO core engine.
- [ ] Add hosted project to crawl config mapping.
- [ ] Add Postgres report store adapter.
- [ ] Add report artifact persistence.
- [ ] Add report page rendering from saved reports.
- [ ] Add Markdown, JSON, CSV, and HTML report surfaces.

### Phase 4: Jobs

- [ ] Add pg-boss.
- [ ] Add worker process.
- [ ] Add crawl job.
- [ ] Add report generation job.
- [ ] Add job status APIs.
- [ ] Add idempotency checks.
- [ ] Add job timeout and heartbeat handling.
- [ ] Add user and MCP job cancellation.
- [ ] Add crawler-blocked detection.
- [ ] Add usage event recording.

### Phase 5: Remote MCP

- [ ] Add OAuth metadata routes.
- [ ] Add authorize route.
- [ ] Add token route.
- [ ] Add client registration route if needed.
- [ ] Add `/mcp` endpoint.
- [ ] Add scoped MCP auth context.
- [ ] Add v1 MCP tools.
- [ ] Add tool call audit logs.
- [ ] Add structured limit errors.
- [ ] Add connected MCP clients page.
- [ ] Add MCP client revocation.

### Phase 6: Google integrations

- [ ] Add hosted Google OAuth app.
- [ ] Store encrypted tokens.
- [ ] Add multiple Google account connections.
- [ ] Add Search Console property picker.
- [ ] Add GA4 property picker.
- [ ] Enforce active GSC verification before hosted crawls.
- [ ] Add GSC sync jobs.
- [ ] Add GA4 sync jobs.
- [ ] Join synced data into reports.
- [ ] Add AI referral evidence.
- [ ] Add optional URL inspection jobs.
- [ ] Add optional CrUX field data support.

### Phase 7: Reports and history

- [ ] Add human report UI.
- [ ] Add agent JSON report views.
- [ ] Add report comparison.
- [ ] Add export downloads.
- [ ] Add freshness and cached report responses.
- [ ] Add technical watch history.
- [ ] Add change test reports.
- [ ] Add knowledge export history.
- [ ] Add shared weekly digest builder.
- [ ] Add weekly digest web page.
- [ ] Add signed share links.
- [ ] Add share-link disable/delete controls.
- [ ] Add export surfaces for JSON, Markdown, CSV, OKF, and llms.txt.

### Phase 8: Billing and hosted limits

- [ ] Add billing customer model.
- [ ] Add plan model.
- [ ] Add hosted compute limits.
- [ ] Add usage tracking.
- [ ] Add upgrade flow.
- [ ] Add trial or beta access flow.
- [ ] Add retention rules by plan.

### Phase 9: Scheduling and alerts

- [ ] Add scheduled audits.
- [ ] Add weekly technical watch.
- [ ] Add weekly digest generation.
- [ ] Add failed-job email alerts.
- [ ] Add new high-severity issue alerts.
- [ ] Add crawler-blocked email alerts.
- [ ] Add dashboard notifications.

### Phase 10: Email

- [ ] Add Resend integration.
- [ ] Add React Email templates.
- [ ] Add email templates for auth, weekly digests, audit completion, audit failure, and alerts.
- [ ] Add plain-text email rendering.
- [ ] Add email preference model.
- [ ] Add unsubscribe handling for non-transactional emails.
- [ ] Add SPF, DKIM, and DMARC setup notes.
- [ ] Add email event logging.
- [ ] Add bounce and complaint handling.

### Phase 11: Admin, support, and trust

- [ ] Add internal admin surface.
- [ ] Add support diagnostics.
- [ ] Add tenant-boundary checks for jobs, reports, exports, tokens, and MCP tools.
- [ ] Add account deletion flow.
- [ ] Add Google disconnect flow.
- [ ] Add crawler whitelist docs.
- [ ] Add terms and privacy pages.
- [ ] Add acceptable use terms for hosted crawling.
- [ ] Prepare Google OAuth verification notes.

### Phase 12: Agent-first blueprint extraction

- [ ] Document the public HTML plus Markdown route pattern.
- [ ] Document the Astro plus MCP plus jobs app shape.
- [ ] Create a reusable blueprint for future agent-first SaaS tools.

## Launch gates

### Private alpha

- account login works
- one connected Google account works
- GSC property picker works
- hosted crawl requires GSC verification
- first report page works
- jobs have terminal states and timeouts
- admin can inspect failed jobs

### Private beta

- multiple Google connections work
- weekly digest works
- weekly digest email works
- crawler-blocked notifications work
- MCP auth and v1 tools work
- tenant-boundary tests pass for core private surfaces
- report sharing is either disabled or signed-link only

### Paid beta

- billing works
- usage accounting works
- plan limits work
- email preferences work
- account deletion and Google disconnect work
- terms, privacy, and acceptable use pages are live
- support diagnostics do not require shell access

### Public launch

- Google OAuth production path is ready
- crawler whitelist docs are public
- SPF, DKIM, and DMARC are configured
- bounce and complaint handling works
- abuse controls are tested
- backup and restore path is documented
- status and support contact are visible

## Open decisions

- Final package and product naming inside npm.
- Whether the Audits app lives in this repo, a separate repo, or a workspace linked to this repo.
- Whether to start with email/password, magic link, or both.
- Whether weekly digests are enabled during beta for all projects or only paid projects.
- Whether alert emails should be separate from the weekly digest in v1.
- Whether to use Stripe at v1 launch or defer billing until the private beta has usage data.
- Whether large report artifacts stay in Postgres JSONB for v1 or move to object storage early.
- Whether public docs are mostly static Astro content or stored as structured content files for easier Markdown rendering.
- Whether crawler IPs can be stable enough to document for allowlisting.

## v1 success criteria

- A user can create an account.
- A user can create a project for a site.
- A user can run a hosted audit.
- The audit runs in the background.
- The result is a plain-English report with structured evidence.
- An MCP client can authenticate through the user's Audits.run account.
- An MCP client can start an audit, poll status, and read the report.
- A repeated identical audit can reuse fresh output.
- Public pages return HTML to humans and Markdown to agents.
- The core engine remains usable outside the hosted app.
