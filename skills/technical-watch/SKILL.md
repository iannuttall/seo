---
name: technical-watch
description: Coordinate crawl comparison, URL Inspection monitoring, and optional link recovery. Use it for a bounded recurring watch without claiming inventory-wide coverage.
---

# Technical watch workflow

This workflow watches several technical surfaces together: crawl change,
sitemap-derived URL inspection, and optional recovery of historically valuable
links. It is useful after releases and on a schedule. Its components have
different coverage and freshness, so a successful run does not prove every URL
is crawlable, indexed, unchanged, or free of issues.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "workflows"` and select `technical-watch`.
2. Call `seo_describe_report` with `id: "technical-watch"`; choose the components required.
3. Call `seo_run_report` with that id and only schema-valid parameters.

CLI parity:

```sh
seo reports describe technical-watch --json
seo reports run technical-watch --params '{"site":"sc-domain:example.com","startUrl":"https://example.com/","sitemaps":["https://example.com/sitemap.xml"],"limit":250,"dailyLimit":200,"inspectLimit":25,"recoverLinks":true}' --json
```

Provide `startUrl` for crawl comparison and `sitemaps` for index monitoring.
`dailyLimit`, `inspectLimit`, `maxUrls`, and crawl `limit` are real coverage
bounds. Enable `js` only when rendering is required.

## Interpret and act

Inspect every workflow step and nested `crawl`, `index`, and `recovery` output
independently. For crawls, compare run ids, limits, failures, warnings, and
changed items. For inspection, distinguish selected, unselected-due, attempted,
failed, quota-blocked, deferred, current issue, and regression states. URL
Inspection is a provider snapshot; sitemap discovery is not proof of indexing.
For recovery, historical clicks-at-risk are observed history, not forecast loss.

Reproduce new failures, verify redirect chains and intentional controls, then
fix confirmed regressions with a rollback path. Schedule another bounded run to
confirm recovery. Never remove `noindex`, canonicals, robots rules, or redirects
without checking intent. Partial crawls, capped sitemap inventories, quotas,
and failed subqueries must stay visible in any all-clear statement.

Use MCP `structuredContent` for automation and Markdown only for the human watch
summary.
