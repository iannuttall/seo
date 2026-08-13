---
name: seo
description: Use and read this skill immediately if the user request is in any way related to SEO or a site's organic search or AI search presence. That includes site audits, rankings, keyword research, competitors, backlinks, click or traffic changes, indexing problems, crawling, redirects, sitemaps, metadata, structured data, Core Web Vitals, internal links, content opportunities, programmatic SEO, local search, Search Console, Google Analytics or Clicky questions, Google update impact, llms.txt, AI search visibility in ChatGPT, Claude, Perplexity, or Google AI Overviews, and client SEO reporting. Routes to evidence-backed local reports through the SEO CLI and MCP server.
---

# seo

Use structured reports for evidence, then inspect source only where a finding
needs it. Reports keep observations, findings, caveats, costs, and provenance
separate. Data stays local unless a requested crawl or provider call needs the
network.

Before the first CLI call, run `command -v seo`. If it is missing, run
`npm i -g seo`, confirm `seo --version`, then continue. Use available MCP tools
without reinstalling.

## Broad audits and source changes

For a broad audit, run this before manual page exploration:

```bash
seo report --url <absolute-url> --search-console-export <path> --actions-only --json
```

Omit `--search-console-export` when no export was supplied. Capture the whole
JSON. Do not pipe it through `head`.

Follow this sequence:

1. Read every field in `findings`, plus `inventories`, retained evidence,
   caveats, and warnings. A `fix` contains an instruction. A `review` contains
   change conditions; it is not an instruction to edit.
2. Compare the live homepage identity with source metadata and content. Treat
   the live product as current unless the user says the source is an undeployed
   pivot. Search history describes past demand, not product direction.
3. Track every finding id and exact title, plus every inventory URL. Counts must
   match `findings.counts.returned` and `returnedItems`. Decide inventory rows
   separately from their evidence; never apply one blanket policy.
4. Use the allowed outcomes. For a fix, choose `fixed`,
   `deferred`, or `not-needed`. For a review, answer its question and choose
   `changed`, `no-change`, or `deferred`, with an evidence-backed reason. Apply
   only supported changes. Build or test the source, run each changed
   item's verification, then rerun the same report against the local build.
5. Return both complete tables. Include each finding's outcome, reason, and
   verification, and each inventory URL's disposition and evidence.

Do not finish while a finding or inventory row is absent from the handoff. If
an inventory returns `nextPage`, fetch every page first.

## Discover, describe, run

With MCP:

1. `seo_list_reports` lists report ids and purposes.
2. `seo_describe_report` returns usage, schema, reading order, limits,
   verification, and related reports.
3. `seo_run_report` runs bounded `params`. Read `structuredContent`.

The CLI has the same catalog:

```bash
seo reports list --json
seo reports describe <report-id> --json
seo reports run <report-id> --params '<json>' --json
```

Describe a report before its first run. Follow `readOrder`, `doNotClaim`, and
`related`; do not guess parameters. For fixes, pass `view: "actions"` to MCP or
`--actions-only` to the JSON CLI command.

Installed provider packages can also add agent actions. Discover them before
calling provider-specific data:

```bash
seo providers list --json
seo providers describe <provider-id> --json
seo providers run <provider-id> <action-id> --params '<json>' --json
```

Use the described input schema. Treat the returned provider data as evidence
with its named source and limits. A provider action is not a report finding.

## Setup and selection

Use `setup-check` or `seo doctor` when auth is unknown. Use `--project <id>` for
a saved project. Without one, pass `--site sc-domain:example.com` or
`--url https://example.com`. Crawl audits need no Google connection. Agent
commands use `--json`, which never prompts.

## Common jobs

Run the first report, read it, then decide. Do not run every report blindly.

| Job | Reports |
|---|---|
| Page not indexed or missing from Google | `index-coverage`, `index-monitor` (URL Inspection), `audit-page`, `redirect-trace` |
| Traffic or clicks dropped | `search-performance-overview`, `traffic-anomaly`, `update-correlation`, `segment-impact`, `decaying-pages`, `link-recovery` |
| Audit a whole site | `report`, then `site-crawl`, `top-fixes`, or `ai-search-scorecard` when needed |
| More clicks from existing pages | `quick-wins`, `ctr-underperformers`, `striking-distance`, `second-page`, `internal-links` |
| AI search visibility or readiness | `ai-readiness`, `agent-readiness`, `geo-gaps`, `ai-mention-research`, `ai-prompt-observations`, `ai-referrals` |
| Plan content from real demand | `query-clusters`, `page-opportunities`, `content-optimization`, `cannibalisation` |
| Research keywords and competitors | `competitive-opportunities`, `keyword-research`, `serp-results`, `ranked-keywords`, `ranking-pages`, `serp-competitors`, `competitor-keyword-gap` |
| Local or programmatic SEO | `local-search-demand`, `pseo-patterns`, `pseo-opportunities`, `pseo-audit` |
| Links, Bing, or server logs | `domain-rating`, `link-evidence`, `bing-webmaster-overview`, `server-log-analysis` |
| Catch regressions | `technical-watch`, `crawl-diff`, `index-watch`, `measure-change` |
| Client-ready reporting | `monthly-report`, `narrative-report`, `monthly-action-plan` |
| Turn crawl findings into tickets | `top-fixes`, `affected-urls`, `explain-crawl-issue` |

When provider access is unavailable, describe the report and use its
`researchFiles` and `columns` schema. Read import provenance and never guess
column mappings.

For a branded client report, use built-in HTML output or create one standalone
local HTML file from structured JSON. Preserve evidence states, provider
labels, limitations, and verification. Keep it accessible, print-friendly,
`noindex,nofollow`, and free of remote scripts or assets.

## Evidence rules

- Name missing, skipped, partial, capped, filtered, or sampled evidence before
  interpreting the result. These states never support a zero or an all-clear.
- Keep live crawl, source code, Search Console, analytics, and research-provider
  evidence separate. Query and page tables are not interchangeable.
- Grouped Search Console totals can undercount.
- Heuristics prioritise review; they do not prove defects or forecast results.
- Treat provider traffic, volume, difficulty, authority, and history as
  estimates. Keep `principle` and `evidenceRef` with recommendations.
- Intentional controls such as `noindex`, canonicals, and robots rules are
  observations until the user confirms they are unintended.
- Never promise clicks, rankings, indexing, traffic, or AI citations.
- Keep the report's verification with every recommendation.

Prefer registered reports. Use `seo help all` for direct provider and
administration commands, including Google, Bing, links, exports, projects, and
crawls. For installed extension actions, use `seo_list_providers`,
`seo_describe_provider`, and `seo_run_provider`. IndexNow writes externally:
validate with `--dry-run --json` and send only when authorised. Refresh only
when needed.
