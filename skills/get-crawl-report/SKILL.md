---
name: get-crawl-report
description: Load a saved crawl snapshot without fetching the site again and opt into detailed evidence only when needed. Use for investigation, verification, or a stable source for follow-up reports.
---

# Load a saved crawl report

Saved reports make technical analysis reproducible: several follow-ups can use the same crawl instead of observing the site at different times. Loading a report is a local storage operation, not a fresh check, so always retain its creation time and original crawl boundaries in the explanation.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only for report discovery. Call `seo_describe_report` with `{ "id": "get-crawl-report" }`, then call `seo_run_report` with:

```json
{
  "id": "get-crawl-report",
  "params": {
    "id": "crawl_example_20260710",
    "includeIssues": true
  }
}
```

Check `isError` and use MCP `structuredContent`. CLI parity is:

```sh
seo reports describe get-crawl-report --json
seo reports run get-crawl-report --params '{"id":"crawl_example_20260710","includeIssues":true}' --json
```

Omitting `id` loads the latest saved report, optionally filtered by `site`. Use an explicit id whenever reproducibility matters. `includePages` adds request and page records; `includeIssues` adds the issue inventory.

## Read the snapshot

Confirm `id`, source URL and site, `generatedAt`, definition id, configuration hash, crawl status, and `requestEvidenceStatus`. Then inspect summary counts, `pageLimitReached`, data sources, warnings, and caveats. Provider states and crawl completeness determine which conclusions are supported.

Keep the default compact result for orientation. Request large page or issue arrays only to answer a concrete question, and filter downstream work by stable rule and URL fields rather than parsing rendered text. A report can be internally valid yet stale, capped, or partial. It cannot prove the current live state. For comparisons, load both reports and establish equivalent scope before interpreting deltas; for verification, run a new crawl with the same configuration and retain both report ids.
