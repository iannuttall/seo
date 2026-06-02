# seo

Local-first TypeScript SEO CLI and MCP server for agent-led SEO diagnosis.

## Current state

This repo is now a runnable v1 foundation:

- pnpm workspace monorepo with `core`, `cli`, and `mcp`
- local config, token, and cache handling
- Google OAuth loopback flow with shared-app-first auth and BYO fallback
- Search Console API client, URL Inspection, and local SQLite cache
- GA4 Data API report runner
- official Google Search Status update feed integration
- statistical traffic anomaly and update-correlation reports
- end-to-end property diagnosis with segment impact and striking-distance opportunities
- narrative and monthly reports that combine diagnosis, change logs, and monitoring history
- agent workflow commands for diagnosis, update postmortems, technical monitoring, and priority refreshes
- saved client profiles for GSC property, crawl URL, watched URLs, GA4 property, and cadence
- guided setup command that creates the first client and prints next commands
- cron helper for local recurring workflow runs
- Semrush and DataForSEO provider adapters
- CLI commands for `init`, `auth`, `privacy`, `reset`, `cache`, and the first diagnostic workflows
- MCP stdio server exposing the same analysis functions

## Packages

- `packages/core`: business logic, storage, providers, fetch/extract, analysis
- `packages/cli`: `seo` command
- `packages/mcp`: MCP stdio server

## Install

```bash
pnpm install
pnpm build
```

If `better-sqlite3` native bindings are missing on your machine, run:

```bash
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
npm run install
```

## Run locally

```bash
node packages/cli/dist/index.js init --dry-run
node packages/cli/dist/index.js setup
node packages/cli/dist/index.js sites
node packages/cli/dist/index.js gsc-query --site sc-domain:example.com --start-date 2026-05-01 --end-date 2026-05-28 --dimensions query,page
node packages/cli/dist/index.js ga4-report --property 123456789 --dimensions landingPage --metrics sessions,totalUsers
node packages/cli/dist/index.js updates
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js traffic-anomaly --site sc-domain:example.com
node packages/cli/dist/index.js diagnose --site sc-domain:example.com
node packages/cli/dist/index.js client add --id example --site sc-domain:example.com --url https://example.com --default
node packages/cli/dist/index.js setup --site sc-domain:example.com --id example --url https://example.com
node packages/cli/dist/index.js report-narrative --site sc-domain:example.com
node packages/cli/dist/index.js monthly-report --site sc-domain:example.com --month 2026-05
node packages/cli/dist/index.js monthly-report --client example
node packages/cli/dist/index.js technical-watch --site sc-domain:example.com --url https://example.com
node packages/cli/dist/index.js refresh-priorities --site sc-domain:example.com
node packages/cli/dist/index.js segment-impact --site sc-domain:example.com --dimension page
node packages/cli/dist/index.js striking-distance --site sc-domain:example.com
node packages/cli/dist/index.js audit-page --url https://example.com
node packages/cli/dist/index.js mcp serve --test
```

## Auth model

- Product default: use the shared `seo` Google desktop app.
- User tokens still live locally on disk. The app client is just app identity for the OAuth consent flow.
- Advanced fallback: `seo auth setup-client` for users who want or need BYO credentials.

The thing worth protecting is the user's local refresh token, not the shipped desktop app client secret.

Google APIs needed for local testing:

- Search Console API for GSC Search Analytics and URL Inspection.
- Google Analytics Data API for GA4 reports.
- Google Analytics Admin API for GA4 property discovery.

This local checkout does **not** include the production shared client. For real auth testing in the repo, use one of:

- `seo auth setup-client`
- `SEO_GOOGLE_CLIENT_ID`
- `SEO_GOOGLE_CLIENT_SECRET`
- legacy `GSC_CLIENT_ID`
- legacy `GSC_CLIENT_SECRET`

Release builds can inject the shared client at build or publish time without committing it to git.

Example:

```bash
SEO_GOOGLE_CLIENT_ID=... \
SEO_GOOGLE_CLIENT_SECRET=... \
pnpm auth:inject-shared-client
```

## Shipped CLI commands

- `seo init`
- `seo setup`
- `seo auth login|logout|whoami|status|refresh|setup-client`
- `seo doctor`
- `seo client setup|list|add|show|default|delete`
- `seo sites`
- `seo ga4-properties`
- `seo gsc-query`
- `seo url-inspect`
- `seo ga4-report`
- `seo updates`
- `seo traffic-anomaly`
- `seo update-correlate`
- `seo diagnose`
- `seo diagnose-property`
- `seo update-postmortem`
- `seo report-narrative`
- `seo monthly-report`
- `seo technical-watch`
- `seo refresh-priorities`
- `seo schedule cron`
- `seo segment-impact`
- `seo striking-distance`
- `seo content-groups list|add|delete`
- `seo change-log list|add|measure`
- `seo crawl-diff`
- `seo index-watch`
- `seo privacy`
- `seo reset`
- `seo cache stats|clear`
- `seo audit-page`
- `seo second-page`
- `seo cannibal`
- `seo decaying`
- `seo quick-wins`
- `seo internal-links`
- `seo ctr-underperformers`
- `seo query-cluster`
- `seo mcp serve|install`

Every command has inline help:

```bash
seo setup --help
seo diagnose --help
seo segment-impact --help
seo striking-distance --help
seo change-log measure --help
seo crawl-diff --help
seo report-narrative --help
seo monthly-report --help
seo client setup --help
seo client add --help
seo technical-watch --help
seo refresh-priorities --help
seo schedule cron --help
```

Defaults are optional. In an interactive terminal, commands that need a GSC
site or GA4 property will open a searchable picker when one is not passed.
For agents, scripts, and `--json`, pass explicit IDs so commands never block:

```bash
seo diagnose --site sc-domain:example.com --json
seo ga4-report --property 123456789 --json
```

## Core boundaries

- `CredentialsProvider`: keeps OAuth clients and Google tokens behind one interface. The CLI uses local files/keychain; a hosted API can swap in tenant storage later.
- `StorageAdapter`: simple get/put/delete persistence for stateful features such as change logs, crawl diffs, and cached reports.
- Analysis functions take data-shaped inputs and return structured reports. CLI and MCP should stay thin wrappers.

## What still needs finishing

- release-time shared OAuth client injection
- richer GSC filtering and more acceptance-test coverage
- hosted/remote MCP auth surface
- scheduled agent workflows over reports and monitoring
- MCP install support beyond the first three desktop clients
- persistence for recent audit resources
- stronger Semrush/DataForSEO endpoint coverage and more provider-aware routing
