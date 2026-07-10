---
name: query-cluster
description: Group retained GSC queries by deterministic token overlap and page evidence; use when an agent needs reproducible demand themes without embeddings or assumed search intent.
---

# Query clusters

Use this report to organise retained GSC query/page rows into stable lexical themes. It normalizes queries, removes low-actionability and optionally branded rows, aggregates page evidence, then groups related wording by shared tokens. This is useful for navigation, information architecture, and review queues because the same input produces the same grouping. Token overlap does not prove shared intent, justify a new page, or establish that current URLs compete with each other.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"opportunities"}`.
2. Call `seo_describe_report` with `{"id":"query-cluster"}`.
3. Call `seo_run_report` with `{"id":"query-cluster","params":{"site":"sc-domain:example.com","scope":"/guides/","minImpressions":50,"limit":20,"includeBrand":false}}`.

The CLI uses the same registry and report handler:

```sh
seo reports describe query-cluster --json
seo reports run query-cluster --params '{"site":"sc-domain:example.com","scope":"/guides/","minImpressions":50,"limit":20,"includeBrand":false}' --json
```

`site` is required. `scope` filters to pages containing the supplied string. The catalog schema exposes a fixed final-data 28-day report window; inspect `range` rather than assuming another period.

## Interpret and act

Start with `summary`: retain cluster count, query count, clicks, impressions, threshold, limit, brand filtering, and high-opportunity count. Read each cluster's member queries, pages, demand, performance, and recommendation together. Expected CTR and opportunity labels are heuristic, using a leave-cluster-out site benchmark when enough peer evidence exists and otherwise a fallback curve. Page-two clusters do not claim a CTR-only click lift. Queries omitted below the threshold or outside the output cap remain outside the conclusion.

Safe actions include reviewing whether a cluster maps to one intent, improving section structure on an existing page, clarifying navigation, or investigating URL overlap with a dedicated report. Do not create one page per cluster, merge pages based on tokens alone, infer semantic equivalence, or describe a low-volume omitted theme as absent demand.
