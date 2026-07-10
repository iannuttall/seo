---
name: top-fixes
description: Rank recurring technical crawl findings into a bounded implementation queue with visible scoring factors. Use for triage before inspecting affected URLs and rule-level evidence.
---

# Prioritize technical fixes

Large crawls need triage, but priority must remain explainable. This report groups issues by rule and ranks them using severity, affected-page count, estimated effort, and any available Search Console or analytics evidence. It is a deterministic queue from retained evidence, not a forecast of rankings, traffic, conversions, or revenue.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only when discovery is needed. Call `seo_describe_report` with `{ "id": "top-fixes" }`, then call `seo_run_report` with:

```json
{
  "id": "top-fixes",
  "params": {
    "reportId": "crawl_example_20260710",
    "category": "metadata",
    "limit": 5
  }
}
```

Confirm `isError` is false and read `structuredContent`. CLI parity is:

```sh
seo reports describe top-fixes --json
seo reports run top-fixes --params '{"reportId":"crawl_example_20260710","category":"metadata","limit":5}' --json
```

Use `url` only for an intentional fresh crawl. Reusing a saved report keeps the queue tied to the same issue inventory.

## Turn priority into work

Read `dataSources`, summary, warnings, and caveats before the ranked fixes. For each item inspect the rule id, affected count, sample URLs, `scoreFactors`, `whyThisRanks`, effort, fix guidance, and verification steps. Missing provider joins must stay unavailable; numeric zeros are meaningful only when the corresponding source is complete and valid.

The category and result limits narrow the queue, while the original crawl may also be capped or partial. Therefore rank means "highest among retained eligible findings," not globally highest. Run `affected-urls` for the same rule and report id, inspect representative templates, and use `explain-issue` before assigning work. Confirm intentional indexability and canonical controls with the publisher. After implementation, repeat the same crawl configuration and verify the observed rule evidence rather than relying on a score change alone.
