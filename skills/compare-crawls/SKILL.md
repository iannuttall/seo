---
name: compare-crawls
description: Compare two saved crawl snapshots with explicit provenance and completeness. Use it to separate observed page changes from crawl-scope, cap, configuration, or source noise.
---

# Compare crawl snapshots

A crawl diff is useful only when its inputs are comparable. This report surfaces page, issue, response, indexability, title, content, and summary changes between two saved snapshots. By default, `after` means the latest report and `before` means the previous report, optionally within one `site` filter.

## Run it

For MCP, use `seo_list_reports` with category `crawl` only for discovery. Call `seo_describe_report` with `{ "id": "compare-crawls" }`, then call `seo_run_report` with:

```json
{
  "id": "compare-crawls",
  "params": {
    "after": "latest",
    "before": "previous",
    "site": "sc-domain:example.com"
  }
}
```

Read `structuredContent` after checking `isError`. The CLI uses the same parameters:

```sh
seo reports describe compare-crawls --json
seo reports run compare-crawls --params '{"after":"latest","before":"previous","site":"sc-domain:example.com"}' --json
```

Use explicit report ids for a release decision so "latest" cannot move between runs.

## Establish comparability first

Read `comparability.status` before interpreting any delta. The accompanying flags show whether the definition ids, config hashes, sites, start URLs, modes, request scopes, and caps match. `before` and `after` preserve each report id, status, normalized `config`, explicit `requestScope`, `caps`, request-evidence status, joined data-source status, warnings, caveats, and completeness. This is enough to assess the inputs without loading two separate reports.

Next inspect top-level `completeness`. If `truncated` is true, or either input is partial or failed, read its stable reason codes and the report-level `caveats`. An absent page from a capped, skipped, failed, or differently scoped crawl is not proven removed. Source row caps also limit joined GSC or GA4 evidence even when the document crawl completed.

Only then inspect `summary`, `pageChanges`, and `issueChanges`. These fields describe retained observations between the named snapshots. Health and GEO score deltas are derived summaries, not ranking or AI-visibility evidence. Prioritize newly observed response failures and unintended indexability flips, then verify titles, content, and issue groups on the affected URLs. Confirm fixes with the same definition and request scope after deployment. When comparability requires review, describe the change as observed between snapshots and name the differing scope, cap, configuration, or incomplete source instead of attributing it to the release.
