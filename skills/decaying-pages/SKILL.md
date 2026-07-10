---
name: decaying-pages
description: Compare retained GSC query-page rows across equal finalized windows to find observed click declines; use when an agent needs a bounded investigation queue without invented attribution.
---

# Decaying queries and pages

Use this report to identify retained query/page combinations that lost clicks between adjacent equal-length periods or year-over-year windows. It requires evidence in both windows, excludes URL shifts, and groups returned rows by diagnosis signal and page template. This avoids turning a row missing from GSC's retained query data into zero traffic. The report shows observed movement, not why it happened.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"opportunities"}`.
2. Call `seo_describe_report` with `{"id":"decaying-pages"}`.
3. Call `seo_run_report` with `{"id":"decaying-pages","params":{"site":"sc-domain:example.com","days":28,"comparison":"previous-period","limit":20,"minDropPct":20,"minPreviousClicks":10,"minClickLoss":5}}`.

The CLI uses the same report definition:

```sh
seo reports describe decaying-pages --json
seo reports run decaying-pages --params '{"site":"sc-domain:example.com","days":28,"comparison":"previous-period","limit":20,"minDropPct":20,"minPreviousClicks":10,"minClickLoss":5}' --json
```

`site` is required. Choose `year-over-year` only when the requested window fits GSC's available history. Brand terms and `includeBrand` control navigational-query filtering.

## Interpret and act

Read `dataStatus`, `ranges`, and `source.completeness` first. Check current and previous fetched rows, caps, truncation, invalid rows, excluded URL shifts, and output limits in `selection`. `summary.observedRetainedQueryClickLoss` covers eligible retained rows; `returnedObservedRetainedQueryClickLoss` covers only the bounded output. Each item preserves current and previous clicks, impressions, CTR, position, `clickLoss`, `dropPct`, signals, and an evidence scope of `retained-query-page-row`. A diagnosis such as `lost_position` or `lost_ctr` labels correlated movement, not a cause.

Safe actions include checking deployments and annotations, live indexability, SERP composition, demand seasonality, and page-template patterns before editing. Use groups to find repeated technical or content hypotheses, then verify individual URLs. Do not sum capped rows into a property-wide loss, treat missing retained rows as zero, or claim that a content change, ranking update, or technical issue caused the decline without separate evidence.
