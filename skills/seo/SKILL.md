---
name: seo
description: Route SEO work across the local seo CLI and MCP server. Use when an agent needs to choose between technical SEO, Search Console, GA4, crawl, opportunity, monitoring, and reporting workflows or inspect evidence returned by several reports.
---

# seo

Use the `seo` MCP server exposed by the repository or installed package.

Reason from MCP `structuredContent`. Treat text or Markdown content as the
display layer. When MCP is unavailable use explicit CLI selectors and `--json`:

```bash
seo report --project <project> --json
seo report --site sc-domain:example.com --json
```

Use the default Markdown output from `seo report-narrative` or
`seo monthly-report` only when the user wants a readable report rather than a
machine contract.

## MCP flow

The default MCP server exposes three tools:

1. Call `seo_list_reports` to discover compact report ids, optionally by
   category.
2. Call `seo_describe_report` once for the selected id to load its exact JSON
   Schema.
3. Call `seo_run_report` with that id and a bounded `params` object.

Do not guess parameters or ask for every report schema up front. Reuse a schema
for repeated runs in the same session.

## Which report id to use

- Diagnosis: `search-performance-overview`,
  `segment-impact`, `striking-distance`, `traffic-anomaly`, and
  `update-correlation`.
- Main follow-ups: `refresh-priorities`, `quick-wins`, `second-page`,
  `decaying-pages`, `cannibalisation`, `ctr-underperformers`, and `query-clusters`.
- Page work: `audit-page`, `page-opportunities`, `content-optimization`,
  `internal-links`, and `performance-audit`.
- Technical crawling: `site-crawl`, `top-fixes`, `affected-urls`,
  `explain-crawl-issue`, `crawl-report`, and `compare-crawls`.
- Indexing and monitoring: `index-coverage`, `index-watch`, `index-monitor`,
  `index-coverage-plan`, `crawl-diff`, `redirect-trace`, and `link-recovery`.
- AI-search evidence: `ai-readiness`, `geo-gaps`, `community-intent`,
  `seo-to-ai-query`, and `ai-referrals`.
- Reporting and measurement: `narrative-report`, `monthly-report`,
  `measure-change`, `pseo-audit`, `update-postmortem`, and
  `technical-watch`.
- Local setup health: `setup-check`.

Use the CLI for project-profile administration and intentionally raw provider
queries. Useful commands include `seo projects list --json`, `seo gsc-query`,
`seo url-inspect`, `seo ga4-properties`, `seo ga4-report`, and `seo updates`.

## Rules

- Treat observations as evidence within the report's methodology and data limits. Do not invent metrics.
- Check `dataStatus`, source completeness, selection counts, warnings, and caveats before summarising a report.
- In diagnosis output, check `summary.updateAttributionStatus` first and treat `summary.updateAttribution` as update-correlation context, not the site's overall diagnosis.
- If `dataStatus` is `partial` or `unavailable`, name the skipped or incomplete evidence before describing findings. Treat capped sources the same way. Never turn unavailable or capped evidence into a zero-result claim.
- Treat quick-win CTR targets and calculated shortfalls as deterministic prioritisation heuristics, not traffic forecasts.
- Quote `principle` and `evidenceRef` when explaining recommendations.
- Do not generate titles, metas, or copy. Keep advice structural and diagnostic.
- If the tool returns no rows, say that clearly instead of padding the answer.
- Remember that grouped GSC query totals can undercount due to anonymised rows.

## Refresh behaviour

- Tool output is cached locally.
- Pass `refresh: true` when the user explicitly wants a fresh fetch.
