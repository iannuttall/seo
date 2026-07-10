---
name: crawl-history
description: Discover locally saved crawl snapshots and their compact metadata without loading full evidence. Use to select stable report ids for follow-ups, comparisons, or verification.
---

# List saved crawl reports

This report is the index for local crawl history. It returns metadata only, ordered newest first, so an agent can choose a snapshot without loading pages and issues or fetching the site again. It says what is stored locally, not what is currently true online.

## Run it

For MCP, call `seo_list_reports` with category `crawl` if discovery is needed. Call `seo_describe_report` with `{ "id": "crawl-history" }`, then `seo_run_report` with:

```json
{
  "id": "crawl-history",
  "params": {
    "site": "sc-domain:example.com",
    "limit": 10
  }
}
```

Confirm MCP `isError` is false, then consume `structuredContent`. The equivalent CLI commands are:

```sh
seo reports describe crawl-history --json
seo reports run crawl-history --params '{"site":"sc-domain:example.com","limit":10}' --json
```

The site filter prevents an unrelated recent crawl from becoming the implicit source. Increase `limit` only when older baselines are genuinely needed.

## Choose a source deliberately

Review each report's id, site, start URL, creation time, status, total pages, issue count, configuration hash, and storage version. Counts are orientation metadata, not enough to judge severity or data completeness. A smaller page count could reflect a scope change, cap, failure, or real site change.

Select an explicit id and load it with `crawl-report` before analysis. For a comparison, inspect both candidates' configuration and caveats instead of assuming adjacent timestamps are comparable. If the expected snapshot is absent, do not silently substitute another site or a fresh crawl; state that the local report was not found. Report lists can also expose old data, so include the creation time whenever presenting a saved finding as context.
