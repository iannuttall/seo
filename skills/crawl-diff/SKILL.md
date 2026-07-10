---
name: crawl-diff
description: Compare a bounded same-origin crawl with its previous saved snapshot; use it to review technical changes after a release without claiming complete site coverage.
---

# Compare crawl snapshots

Use `crawl-diff` after a deploy, migration, or planned technical change. It
crawls a bounded same-origin set, saves the result, and compares it with the
previous saved run for the same surface. This turns status, indexability,
canonical, metadata, content, and inventory movement into a review queue. It
does not prove that a changed page affected search performance.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"monitoring"}`, then call
`seo_describe_report` with `{"id":"crawl-diff"}`. Run the exact schema with
`seo_run_report`, for example
`{"id":"crawl-diff","params":{"startUrl":"https://example.com/","site":"sc-domain:example.com","limit":250,"js":false,"refresh":true}}`.

CLI parity uses the same definition:

```sh
seo reports describe crawl-diff --json
seo reports run crawl-diff --params '{"startUrl":"https://example.com/","site":"sc-domain:example.com","limit":250,"refresh":true}' --json
```

The schema types `limit` as a broad number. Pass a positive whole-page bound and
keep it stable between comparison runs.

## Interpret the output

Compare `run` with `previousRun` before reading `summary`. A missing previous
run means the current crawl is a baseline, not a change result. Check the start
URL, limit, URL count, timestamps, rendering choice, and `warnings` for both
runs.

`summary` counts crawled, added, removed, changed, new errors, indexability
flips, and high-priority recommendations. Trace every important count into
`items`, where `before`, `after`, and `changes` preserve observed evidence.
`recommendations` rank review actions; they do not override the raw snapshots.
A removed URL may be outside the current discovered set or limit rather than
deleted. A fetch or extraction failure cannot support a resolved issue.

## Act safely

Verify high-priority status and indexability changes directly, then compare the
deployment intent. Restore accidental failures or controls, but leave intended
redirects, canonicals, and noindex directives alone. Repeat with comparable
scope after a fix. Never call a bounded diff an inventory-wide audit or infer
ranking impact from technical change alone.
