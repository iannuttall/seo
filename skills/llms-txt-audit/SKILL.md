---
name: llms-txt-audit
description: Inspect an optional llms.txt file and derive a bounded set of suitable page candidates from crawl evidence. Use when reviewing agent-facing site navigation without treating the file as a ranking requirement.
---

# Audit llms.txt

`llms.txt` is optional publisher-provided navigation for agents. Its presence is not a general search requirement or ranking signal, and its absence is not a technical SEO defect. This report checks the observed file response and suggests eligible pages that could belong in a useful inventory.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only when discovery is needed. Call `seo_describe_report` with `{ "id": "llms-txt-audit" }`, then `seo_run_report` with:

```json
{
  "id": "llms-txt-audit",
  "params": { "reportId": "crawl_example_20260710" }
}
```

Check MCP `isError`, then read `structuredContent`. The CLI exposes the same contract:

```sh
seo reports describe llms-txt-audit --json
seo reports run llms-txt-audit --params '{"reportId":"crawl_example_20260710"}' --json
```

Using `url` instead of `reportId` starts a fresh crawl. Prefer a saved snapshot when the recommendations will be compared with other reports.

## Interpret the result

Review `exists`, the resolved file URL, response status, headline, issues, and `recommendedPages`. Candidate pages are drawn from successfully fetched, indexable pages and exclude common utility or private paths; ordering uses crawl evidence such as internal authority and content depth. That selection is a heuristic inventory, not proof that every important page is present or suitable for publication.

Check the source report's date, cap, partial state, failed requests, warnings, and caveats with `crawl-report`. A short recommendation list from a capped crawl is not sitewide evidence. If the file exists, verify that its URLs are current, canonical, public, and aligned with publisher intent. If it does not exist, recommend creating one only when it improves agent navigation. Keep any generated file concise and human-reviewed; never claim that adding it will improve indexing, rankings, traffic, AI selection, or citations.
