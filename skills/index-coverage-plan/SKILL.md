---
name: index-coverage-plan
description: Allocate sitemap URLs across available GSC properties under URL Inspection capacity; use it to design a monitoring cycle before spending inspection quota.
---

# Plan inspection coverage

Use `index-coverage-plan` when sitemap inventory is larger than the URL
Inspection checks you can run each day. It fetches sitemap URLs, maps them to
the most specific available Search Console properties, estimates cycle time,
and can suggest URL-prefix properties for large folders. It does not call URL
Inspection and does not report whether any URL is indexed.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"monitoring"}`. Call
`seo_describe_report` with `{"id":"index-coverage-plan"}`, then call
`seo_run_report`, for example
`{"id":"index-coverage-plan","params":{"site":"sc-domain:example.com","sitemaps":["https://example.com/sitemap.xml"],"dailyLimit":200,"targetCycleDays":7,"maxUrls":50000}}`.

The CLI uses the same report schema:

```sh
seo reports describe index-coverage-plan --json
seo reports run index-coverage-plan --params '{"site":"sc-domain:example.com","sitemaps":["https://example.com/sitemap.xml"],"dailyLimit":200,"targetCycleDays":7,"maxUrls":50000}' --json
```

Pass `properties` only when you intentionally want to override discovered GSC
properties. Every sitemap URL must belong to the root property.

## Interpret the output

Read `summary.sitemapUrls`, `urlCount`, property count, daily capacity,
estimated cycle days, target cycle days, and suggestion count together.
`properties` shows each allocation, daily limit, estimated cycle, and sample
URLs. `suggestions` identifies folders that might benefit from a separate
URL-prefix property and explains the calculated reason.

Inspect every `warning`. Sitemap fetch failures, invalid or out-of-property
URLs, nested-sitemap boundaries, deduplication, or `maxUrls` truncation make the
plan incomplete. Estimated cycle time is arithmetic based on discovered URLs
and configured capacity; it is not a promise that Google will process or index
those URLs.

## Act safely

Use the plan to set a realistic recurring `index-monitor` limit. Add a suggested
property only if you control it and the operational benefit is worth the setup.
Fix sitemap discovery problems before increasing quota. Do not report an index
coverage percentage, excluded count, or all-clear from this allocation plan.
