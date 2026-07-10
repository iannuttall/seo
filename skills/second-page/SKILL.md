---
name: second-page
description: Find retained GSC page-query rows with average positions from 10 through 20. Use them as bounded investigation prompts, not promised ranking wins.
---

# Second-page opportunities

This report surfaces page-query combinations near the first-page boundary so an
agent can inspect whether the page satisfies the observed query. It is a triage
tool. Average position is aggregated across searches, locations, devices, and
time; it is not an exact rank, proof of intent mismatch, or evidence that an
edit will improve performance.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "reporting"` and select `second-page`.
2. Call `seo_describe_report` with `id: "second-page"`; inspect bounds and defaults.
3. Call `seo_run_report` with `id: "second-page"` and matching parameters.

CLI parity:

```sh
seo reports describe second-page --json
seo reports run second-page --params '{"site":"sc-domain:example.com","range":28,"minImpressions":50,"limit":10,"includeBrand":false,"verifyContent":true,"verifyLimit":5}' --json
```

`range` is the analysis window. `minImpressions` removes very sparse candidates.
`limit` is a retained-output cap. `verifyContent` fetches only up to
`verifyLimit` candidates, so unverified items remain unknown rather than failed.

## Interpret and act

Check source completeness, date range, `selection`, `methodology`, provenance,
brand filtering, and caveats before ranking the items. Duplicate provider rows
should already be aggregated deterministically, but retained limits still mean
the output is not a complete inventory. Read impressions, clicks, CTR, and
average position as observed metrics. Treat the priority value as a transparent
heuristic, not expected click lift.

For a promising item, inspect the live page and search intent, verify that the
query is appropriate for the URL, review internal linking and competing pages,
then make one defensible change. Preserve pages already satisfying intent.
Never add text solely to hit a length threshold, promise a first-page result,
or infer cannibalisation from one row. If the source is capped, partial, or
filtered, say so in the recommendation.

Use MCP `structuredContent` as the machine contract and Markdown only to explain
the evidence and next investigation to a human.
