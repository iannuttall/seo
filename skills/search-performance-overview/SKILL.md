---
name: search-performance-overview
description: Find where Google Search clicks and impressions changed, which pages or queries explain the movement, and which focused report to run next. Use when search performance moved or an agent needs a first-party baseline but does not yet know where to investigate.
---

# Search performance overview

Use this when organic search performance changed and you do not yet know which
pages, queries, countries, or devices explain it. It is also the best first
report for a newly connected Search Console property. The report finds where
the movement sits, then points to the focused report that can verify the issue.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "workflows"` and select `search-performance-overview`.
2. Call `seo_describe_report` with `id: "search-performance-overview"` and inspect its schema.
3. Call `seo_run_report` with that id and only schema-valid parameters.

CLI parity:

```sh
seo reports describe search-performance-overview --json
seo reports run search-performance-overview --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"limit":10,"includeBrand":false}' --json
```

`days` sets the main evidence window and `recentDays` sets the recent comparison
period. `limit` caps the items returned; it does not increase provider coverage.

## Interpret and act

Read the workflow envelope first: `workflow`, `site`, `generatedAt`, `summary`,
`steps`, `actions`, and `output`. Every step has its own status and evidence.
Then inspect the report's `dataStatus`, skipped sections, partial reasons,
priorities, and nested anomaly, update, segment, decay, cannibalisation,
striking-distance, and quick-win results. Do not let one complete section hide a
failed or capped neighbour.

Start with actions that cite reproducible evidence. Confirm affected URLs,
provider dates, selection limits, and intentional technical controls before
editing anything. Run a focused report to inspect detail rather than asking this
broad workflow for a larger payload. Sparse data may legitimately skip a
section. Update overlap, opportunity scores, average position, and timing are
investigation signals, not causation or forecasts.

Treat MCP `structuredContent` as the machine contract. Use Markdown for the
human summary while preserving structured evidence references in any handoff.
