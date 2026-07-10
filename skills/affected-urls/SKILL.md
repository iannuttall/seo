---
name: affected-urls
description: Find the exact crawl issues attached to individual URLs and preserve their joined traffic evidence. Use when turning a rule, category, or severity group into a bounded implementation list.
---

# Find affected URLs

Use this report after a crawl has identified a technical pattern. A rule count is useful for triage, but implementation needs the exact URLs, the observed evidence, and a stable source crawl. Prefer `reportId` so every follow-up refers to the same snapshot; pass `url` only when a new crawl is intentional.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only when discovery is needed. Then call `seo_describe_report` with `{ "id": "affected-urls" }`. Finally call `seo_run_report` with:

```json
{
  "id": "affected-urls",
  "params": {
    "reportId": "crawl_example_20260710",
    "ruleId": "missing_title",
    "severity": "high",
    "limit": 50
  }
}
```

Read MCP `structuredContent` as the contract and check `isError` before using it. The text result is a compact explanation, not the data source.

The CLI exposes the same report:

```sh
seo reports describe affected-urls --json
seo reports run affected-urls --params '{"reportId":"crawl_example_20260710","ruleId":"missing_title","severity":"high","limit":50}' --json
```

## Read and act

Each row ties a URL to a rule, category, severity, and crawler evidence. Optional clicks, impressions, and sessions help order work, but inspect `dataSources` first: unavailable provider data must not be interpreted as a real zero. Results are sorted deterministically by severity, joined demand signals, and URL.

Check the requested filters, returned count, `limit`, original crawl cap, warnings, and caveats before calling the set complete. A capped or partial crawl only supports "affected among evaluated pages." Create fixes from the observed evidence, sample several URL templates, and use `explain-issue` for rule guidance. Re-run the same bounded crawl after deployment to verify that the rule no longer triggers; disappearance from a differently scoped crawl is not verification.
