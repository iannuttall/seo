---
name: ctr-underperformers
description: Find high-impression page-one GSC rows below a site-aware CTR benchmark; use when an agent needs a bounded snippet review queue with heuristic shortfalls kept explicit.
---

# CTR underperformers

Use this report to prioritise retained query/page rows whose observed CTR is materially below a position-based benchmark. It aggregates duplicate rows before analysis and prefers a robust site-aware peer benchmark when enough evidence exists, otherwise it uses a built-in fallback curve. The result can identify snippets worth reviewing, but it cannot observe the live SERP layout, explain user intent, isolate title or description effects, or promise that the calculated shortfall is recoverable.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"opportunities"}`.
2. Call `seo_describe_report` with `{"id":"ctr-underperformers"}`.
3. Call `seo_run_report` with `{"id":"ctr-underperformers","params":{"site":"sc-domain:example.com","minImpressions":250,"includeBrand":false}}`.

The CLI calls the same handler:

```sh
seo reports describe ctr-underperformers --json
seo reports run ctr-underperformers --params '{"site":"sc-domain:example.com","minImpressions":250,"includeBrand":false}' --json
```

`site` is required. This catalog schema exposes only `minImpressions` and `includeBrand`; the report itself uses a final-data 28-day window and reports its output limit in `summary`.

## Interpret and act

Check `dataStatus`, `range`, `source.completeness`, `possiblyTruncated`, validation counts, and `selection` before looking at the queue. Invalid rows make the report partial; duplicate rows are aggregated, not silently counted twice. For every item, keep query, URL, impressions, position, observed CTR, target CTR, benchmark source/confidence, and estimated shortfall together. The shortfall is directional prioritisation math, not a traffic forecast. Page-one average position also hides day, device, geography, and result-feature variation.

Safe actions are to inspect the current SERP and displayed title link, confirm the page matches intent, then test clearer framing where evidence supports it. Annotate the change and compare a complete later period. Do not rewrite already appropriate copy merely to chase the benchmark, infer causation from CTR alone, or call a partial empty result an all-clear.
