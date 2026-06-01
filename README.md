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
node packages/cli/dist/index.js sites
node packages/cli/dist/index.js gsc-query --site sc-domain:example.com --start-date 2026-05-01 --end-date 2026-05-28 --dimensions query,page
node packages/cli/dist/index.js ga4-report --property 123456789 --dimensions landingPage --metrics sessions,totalUsers
node packages/cli/dist/index.js updates
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js traffic-anomaly --site sc-domain:example.com
node packages/cli/dist/index.js diagnose --site sc-domain:example.com
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
- `seo auth login|logout|whoami|status|refresh|setup-client`
- `seo doctor`
- `seo sites`
- `seo ga4-properties`
- `seo gsc-query`
- `seo url-inspect`
- `seo ga4-report`
- `seo updates`
- `seo traffic-anomaly`
- `seo update-correlate`
- `seo diagnose`
- `seo segment-impact`
- `seo striking-distance`
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
seo diagnose --help
seo segment-impact --help
seo striking-distance --help
```

## Core boundaries

- `CredentialsProvider`: keeps OAuth clients and Google tokens behind one interface. The CLI uses local files/keychain; a hosted API can swap in tenant storage later.
- `StorageAdapter`: simple get/put/delete persistence for stateful features such as change logs, crawl diffs, and cached reports.
- Analysis functions take data-shaped inputs and return structured reports. CLI and MCP should stay thin wrappers.

## What still needs finishing

- release-time shared OAuth client injection
- richer GSC filtering and more acceptance-test coverage
- change-log and before/after significance testing
- crawl-diff persistence
- MCP install support beyond the first three desktop clients
- persistence for recent audit resources
- stronger Semrush/DataForSEO endpoint coverage and more provider-aware routing
