---
name: seo
description: Use and read this skill immediately if the user request is in any way related to SEO or a site's organic search or AI search presence. That includes site audits, rankings, keyword research, competitors, backlinks, click or traffic changes, indexing problems, crawling, redirects, sitemaps, metadata, structured data, Core Web Vitals, internal links, content opportunities, programmatic SEO, local search, Search Console or Google Analytics questions, Google update impact, llms.txt, AI search visibility in ChatGPT, Claude, Perplexity, or Google AI Overviews, and client SEO reporting. Routes to evidence-backed local reports through the SEO CLI and MCP server.
---

# seo

`seo` is a local CLI, MCP server, and report engine using crawl, Search Console,
Google Analytics, optional Bing evidence, and optional research providers.
Reports keep observations, estimates, findings, caveats, costs, and provenance
separate. Data stays local. Discover reports at runtime instead of memorising
them.

## Discover, describe, run

With the MCP server (preferred):

1. `seo_list_reports` returns report ids and purposes, optionally by category.
2. `seo_describe_report` returns one report's usage, schema, reading order,
   limits, verification, and related ids.
3. `seo_run_report` runs bounded `params`. Read `structuredContent`, not display
   text.

The same catalog exists without MCP:

```bash
seo reports list --json
seo reports describe <report-id> --json
seo reports run <report-id> --params '<json>' --json
```

Describe a report before its first run. Follow `readOrder`, `doNotClaim`, and
`related`; reuse its schema and do not guess parameters. When `fixableChecks`
exists, fetch guidance only for failed or warning ids in `topActions` with
`seo_describe_report` using `id` and `check` (CLI:
`seo reports describe <report-id> --check <check-id>`).

## Setup and selection

Use `setup-check` or `seo doctor` when auth is unknown. Select profiles with
`--project <id>` and list them with `seo projects list --json`. Without one,
pass `--site sc-domain:example.com` or `--url https://example.com`. Crawl audits
need no Google connection. Agent commands use `--json`, which never prompts.

## Common jobs

Run the first report, read it, then decide. Do not run a whole chain blindly.

| Job | Reports |
|---|---|
| Page not indexed or missing from Google | `index-coverage`, `index-monitor` (URL Inspection), `audit-page`, `redirect-trace` |
| Traffic or clicks dropped | `search-performance-overview`, `traffic-anomaly`, `update-correlation`, `segment-impact`, `decaying-pages`, `link-recovery` |
| Audit a whole site | `site-crawl` with `health: true`, `report` command (main report), full `site-crawl` only if needed, `top-fixes`, `ai-search-scorecard` |
| More clicks from existing pages | `quick-wins`, `ctr-underperformers`, `striking-distance`, `second-page`, `internal-links` |
| AI agent readiness for a content site | `agent-readiness`, `ai-readiness`, `entity-readiness`, `llms-txt-audit` |
| AI search visibility and eligibility | `ai-readiness`, `geo-gaps`, `ai-mention-research`, `ai-referrals`, `seo-to-ai-query` |
| Plan content from real demand | `query-clusters`, `page-opportunities`, `content-optimization`, `cannibalisation` |
| Research keywords and current results | `keyword-research`, `keyword-metrics`, `saved-keywords`, `serp-results` |
| Find search competitors and plausible gaps | `serp-competitors`, `domain-overview`, `ranking-pages`, `ranked-keywords`, `competitor-keyword-gap` |
| Research programmatic SEO opportunities | `keyword-opportunities`, `pseo-opportunities`, `ranking-pages`, `competitor-keyword-gap`, then `pseo-audit` for an existing site |
| Catch regressions over time | `technical-watch`, `crawl-diff`, `index-watch`, `measure-change` after a fix ships |
| Track exact keyword positions | `rank-tracking` for a saved set and fixed market/device; `serp-results` for one current query |
| Review Bing traffic, crawl, query, and page insights | `bing-webmaster-overview`, then `site-crawl` when live page evidence is needed |
| Review referring links and linked targets | `link-evidence`, then verify selected referring URLs and flagged targets directly |
| Review real crawler requests in a server log | `server-log-analysis`, then verify important errors against the original log and server configuration |
| Client-ready reporting | `monthly-report`, `narrative-report`, `monthly-action-plan` |
| Turn crawl findings into tickets | `top-fixes`, `affected-urls`, `explain-crawl-issue` |

Use `seo report` first for a broad performance question with a known project.
For a large or unfamiliar URL, run sitemap health before a full crawl.

## Create a client HTML report

For a polished or branded report, create one standalone HTML file from
structured data. Built-in `--format html` is a predictable fallback. Start with
compact JSON and request `--full` only when deeper evidence is needed. Follow
supplied brand direction and design for the findings. Use responsive,
accessible, print-friendly HTML, embedded CSS, `noindex,nofollow`, and no remote
scripts or assets.

Show site, period, generated date, provider labels, data status, priorities,
limitations, and verification. Preserve partial, capped, sampled, missing, and
skipped states. Keep observations separate from interpretation and providers
separate from each other. Never invent scores, forecasts, causes, or missing
values. Omit secrets and unnecessary raw rows. Save locally and report the path.

For a large site, run `site-crawl` with `health: true` and an explicit
`sitemapUrl` when known. Read `config.strategy`, `access`, failures, limits, and
sitemap completeness. Full crawl second only for page content, metadata,
canonicals, links, structured data, or rendered HTML.

Requests use `SEO-Skill/<version> (+https://seoskill.dev)`. For
`access.blockedRequests`, show provider evidence and the identity. Ask for a
temporary exception scoped by audit IP, host or paths, and blocking rule. Never
recommend a User-Agent-only bypass.

## Evidence rules

- Check `dataStatus`, selection counts, `caveats`, and `warnings` before
  summarising any report. Name skipped or incomplete evidence first.
- Partial, capped, filtered, or sampled sources never support a zero or an
  all-clear. Grouped Search Console totals undercount because anonymised query
  rows are withheld.
- Values marked heuristic are prioritisation aids, not forecasts. Never
  promise clicks, rankings, indexing, or AI citations from any report.
- Quote `principle` and `evidenceRef` when explaining a recommendation, and
  give the user the report's verification step alongside any suggested change.
- If a report returns no rows, say so plainly.
- Intentional controls such as `noindex`, canonicals, and robots rules are
  observations until the user confirms they are unintended.
- Provider traffic, volume, difficulty, visibility, intent, authority, and
  ranking history are estimates. Keep them separate from Search Console,
  Google Analytics, crawl, and live result evidence.

## Beyond the report catalog

Use `seo help all` for direct provider and administration commands. Bing setup
uses `seo providers bing`; link evidence uses `seo links --project <id> --json`,
`seo links --provider dataforseo --target <domain> --json`, or a local file.
IndexNow writes externally: validate with
`seo indexnow submit --dry-run --json` and remove dry run only when authorised.
Receipt does not prove crawling or indexing. Prefer registered reports.

Use `refresh: true` or `--refresh` only when fresh data is requested. Sitemap
health always bypasses page-body cache and never writes page responses.
