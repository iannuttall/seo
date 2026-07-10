---
name: index-monitor
description: Select due sitemap URLs and store bounded Google URL Inspection snapshots; use it for recurring index-state monitoring under local quota controls.
---

# Monitor sitemap URLs

Use `index-monitor` for a recurring, quota-aware sample of sitemap URLs. It
builds a bounded inventory, allocates URLs to the most specific GSC property,
selects due checks, calls URL Inspection, and stores snapshots for later change
classification. The result describes Google's indexed snapshot for selected
URLs. It is not a live crawl and cannot establish the status of every sitemap
URL in one run.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"monitoring"}`, then
`seo_describe_report` with `{"id":"index-monitor"}`. Call `seo_run_report` with
schema-valid parameters, for example
`{"id":"index-monitor","params":{"site":"sc-domain:example.com","sitemaps":["https://example.com/sitemap.xml"],"dailyLimit":200,"inspectLimit":25,"maxUrls":50000,"languageCode":"en-GB"}}`.

CLI parity uses the same registry:

```sh
seo reports describe index-monitor --json
seo reports run index-monitor --params '{"site":"sc-domain:example.com","sitemaps":["https://example.com/sitemap.xml"],"dailyLimit":200,"inspectLimit":25,"maxUrls":50000,"languageCode":"en-GB"}' --json
```

## Interpret the output

Read `dataStatus` and `source` first. Check sitemap and inventory limits,
discovered and invalid URLs, truncation flags, omitted minimum count, daily
limit, inspection limit, freshness window, and retry interval.

In `summary`, keep inventory states distinct: never attempted, never succeeded,
retry waiting, fresh, stale, due, selected, unselected due, attempted,
inspected, failed, quota blocked, deferred, and skipped. A due URL that was not
selected has no new inspection result. `properties` explains allocation and
execution per property. In `items`, separate `inspectionStatus`, `indexStatus`,
current issue codes, regressions, recoveries, alerts, and operational errors.
Read `caveats` and `warnings` before an all-clear.

## Act safely

Investigate regressions and current issues with a live page audit, sitemap
review, and the exact inspection evidence. Retry failed, deferred, or
quota-blocked checks according to `retryAt`; do not convert them into SEO
defects. Increase cycle coverage gradually. A complete selected batch still
does not prove inventory-wide indexing, recrawl timing, or future inclusion.
