---
name: compare-crawl-reports
description: Compare two saved crawl snapshots and separate real page changes from crawl-scope noise. Use when verifying a release, remediation batch, migration, or technical regression.
---

# Compare crawl snapshots

A crawl diff is useful only when its inputs are comparable. This report surfaces page, issue, response, indexability, title, content, and summary changes between two saved snapshots. By default, `after` means the latest report and `before` means the previous report, optionally within one `site` filter.

## Run it

For MCP, use `seo_list_reports` with category `crawl` only for discovery. Call `seo_describe_report` with `{ "id": "compare-crawl-reports" }`, then call `seo_run_report` with:

```json
{
  "id": "compare-crawl-reports",
  "params": {
    "after": "latest",
    "before": "previous",
    "site": "sc-domain:example.com"
  }
}
```

Read `structuredContent` after checking `isError`. The CLI uses the same parameters:

```sh
seo reports describe compare-crawl-reports --json
seo reports run compare-crawl-reports --params '{"after":"latest","before":"previous","site":"sc-domain:example.com"}' --json
```

Use explicit report ids for a release decision so "latest" cannot move between runs.

## Establish comparability first

Before interpreting deltas, load both snapshots with `get-crawl-report`. Compare URL, site, configuration hash, page cap, filters, rendering mode, request evidence, failed fetches, warnings, and whether either crawl was partial. The diff output does not prove that its two crawl scopes match. A page absent from a capped or failed crawl is not proven removed.

Then inspect summary deltas and the underlying `pageChanges` and `issueChanges`. Treat health-score movement as a derived summary, not ranking evidence. Prioritize new response failures and unintended indexability flips, then verify changed titles, content, and issue groups against the affected URLs. Confirm fixes by repeating the same configuration after deployment. Report uncertain changes as "observed between snapshots" and name the scope difference instead of attributing them to the site or release.
