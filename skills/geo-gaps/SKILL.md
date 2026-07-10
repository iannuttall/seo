---
name: geo-gaps
description: Find URL-level technical barriers to AI-search eligibility while keeping access and selection separate. Use when reviewing response, crawl, indexability, canonical, or snippet restrictions from a crawl.
---

# Find AI-search eligibility gaps

Content cannot be selected when a system cannot retrieve or use it, but technical access never guarantees selection. This report narrows crawl evidence to response failures, robots restrictions, non-indexing directives, canonicalized pages, and snippet controls. It is a diagnostic URL list, not a visibility score.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only if discovery is required. Call `seo_describe_report` with `{ "id": "geo-gaps" }`, then call `seo_run_report` with:

```json
{
  "id": "geo-gaps",
  "params": {
    "reportId": "crawl_example_20260710",
    "limit": 25
  }
}
```

Confirm `isError` is false and consume `structuredContent`. The CLI flow is:

```sh
seo reports describe geo-gaps --json
seo reports run geo-gaps --params '{"reportId":"crawl_example_20260710","limit":25}' --json
```

## Interpret each gap

For every URL, separate `issues` from `searchEligibility`. Review successful HTML response, crawl permission, indexable-candidate status, declared and effective indexability, canonical evidence, and snippet eligibility. A `null` access state means unknown, not allowed. Semantic HTML, structured data, authorship, dates, question headings, and answerable blocks are observations; they do not override a hard access restriction or create eligibility by themselves.

Confirm intent before treating `noindex`, robots rules, canonicals, or snippet limits as defects. Fix unintended response and access conflicts first, then verify the exact URL and directive after deployment. The report is limited and its output does not currently carry the source crawl's full cap, partial-state, warning, or caveat metadata. Load the same report with `get-crawl-report` before making sitewide claims. An empty or short gap list is only "none found among retained results"; it does not prove indexing, visibility, selection, citation, or complete coverage.
