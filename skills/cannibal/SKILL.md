---
name: cannibal
description: Find retained GSC queries with material exposure across multiple URLs; use when an agent needs an intent and technical review queue rather than an automatic consolidation verdict.
---

# Multi-URL query exposure

Use this report to find exact normalized queries whose retained GSC impressions are materially distributed across more than one URL. It combines query/page exposure with property-level query demand, suppresses low-actionability cases, and ranks review candidates using demand and secondary exposure. Multiple ranking URLs can be correct for mixed intent, local/entity results, or distinct page purposes, so the report deliberately calls them URL-overlap candidates rather than proven harmful cannibalisation.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"opportunities"}`.
2. Call `seo_describe_report` with `{"id":"cannibal"}`.
3. Call `seo_run_report` with `{"id":"cannibal","params":{"site":"sc-domain:example.com","days":90,"limit":20,"minImpressions":100,"includeBrand":false}}`.

The CLI runs the identical definition:

```sh
seo reports describe cannibal --json
seo reports run cannibal --params '{"site":"sc-domain:example.com","days":90,"limit":20,"minImpressions":100,"includeBrand":false}' --json
```

`site` is required. `brandTerms` accepts up to 20 explicit terms; use `includeBrand:true` only when navigational brand overlap is part of the investigation.

## Interpret and act

Start with `dataStatus`, both `source.pageExposure` and `source.propertyDemand`, their validation counts, caps, and `source.completeness`. A partial or possibly truncated source cannot support an all-clear. Use `selection` to see why groups were excluded or suppressed. Within each item, inspect every page's clicks, impressions, position, impression share, template, `reviewContext`, HHI, and secondary exposure. `suggestedOwnerUrl` is chosen mechanically by clicks, then impressions, then position; its confidence is low and `requiresIntentReview` is true. `priority.score` is a heuristic, not estimated click lift.

Safe actions include comparing intent and live SERPs, checking canonicals and redirects, clarifying internal-link ownership, or differentiating genuinely distinct pages. Consolidate only when intent, content, technical signals, and business purpose agree. Never redirect or canonicalize a secondary URL solely because it appears in this report.
