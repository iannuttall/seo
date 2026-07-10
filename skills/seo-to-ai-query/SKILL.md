---
name: seo-to-ai-query
description: Convert retained GSC query wording into deterministic AI monitoring prompts; use when an agent needs a reproducible prompt seed set without claiming observed AI demand or visibility.
---

# Queries to AI prompts

Use this report to turn first-party GSC query wording into a bounded set of prompts for later manual or automated monitoring. Each source query keeps its clicks, impressions, CTR, and average position, while deterministic templates produce stable prompt suggestions. The output is useful for designing a monitoring corpus. It is not evidence that anyone entered those prompts into an AI product, that an answer mentioned the site, or that the source query has equivalent AI demand.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"ai-search"}`.
2. Call `seo_describe_report` with `{"id":"seo-to-ai-query"}`.
3. Call `seo_run_report` with `{"id":"seo-to-ai-query","params":{"site":"sc-domain:example.com","days":90,"limit":20,"minImpressions":100,"maxRows":10000}}`.

The CLI uses the same registry entry:

```sh
seo reports describe seo-to-ai-query --json
seo reports run seo-to-ai-query --params '{"site":"sc-domain:example.com","days":90,"limit":20,"minImpressions":100,"maxRows":10000}' --json
```

`site` is required. Use either `days` or an explicit `startDate` and `endDate` pair. `maxRows` bounds source retrieval and `limit` bounds returned queries. Supply `brandTerms` or `includeBrand:true` only when brand handling is intentional.

## Interpret and act

Check `dataStatus` before reading `items`: `empty`, `filtered`, `partial`, and `available` mean different things. Preserve `dateRange`, `source.possiblyTruncated`, filters, `selection.invalidRows`, `selection.conflictingRows`, limited rows, warnings, and caveats. `methodology.observedAiPromptData` and `estimatedTrafficLift` are explicitly false. Each item has `evidenceScope: retained-gsc-query`; its prompts inherit that narrow scope.

Safe actions are to select representative prompt variants, store the source query and date range beside later observations, and refresh the corpus on a controlled schedule. Do not report generated prompt count as AI demand, fill missing prompts with guessed traffic, or interpret no returned rows as an all-clear when the source is partial or filtering removed candidates.
