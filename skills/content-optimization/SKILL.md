---
name: content-optimization
description: Build a content brief for one URL from retained GSC queries and live page observations; use when an agent needs evidence-led edit ideas without treating query wording as a content mandate.
---

# Content optimization

Use this report when an existing page has first-party search visibility and needs a focused review. It joins exact-URL GSC query/page rows to a fetched page, classifies query wording into broad intent heuristics, and turns verified opportunity types into title, H1, meta, section, and internal-link angles. It does not prove searcher intent, diagnose why a page ranks where it does, or guarantee that adding the suggested wording will improve traffic.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"ai-search"}`.
2. Call `seo_describe_report` with `{"id":"content-optimization"}`.
3. Call `seo_run_report` with `{"id":"content-optimization","params":{"site":"sc-domain:example.com","url":"https://example.com/guides/seo","days":90,"limit":20,"minImpressions":50,"verifyContent":true}}`.

The CLI runs the same definition:

```sh
seo reports describe content-optimization --json
seo reports run content-optimization --params '{"site":"sc-domain:example.com","url":"https://example.com/guides/seo","days":90,"limit":20,"minImpressions":50,"verifyContent":true}' --json
```

`site` and an HTTP(S) `url` are required. The URL must belong to the selected GSC property. Set `js:true` only when the useful content requires rendering; use `refresh:true` when stale cache evidence would change the decision.

## Interpret and act

Read `sourceReport` before the derived brief. Check its `dataStatus`, `selection`, `benchmark.possiblyTruncated`, `verification.status`, warnings, and caveats. Treat `summary.score`, `primaryIntent`, and `estimatedClickLift` as prioritisation heuristics, not quality grades or forecasts. In `topActions`, separate `technical-check` and `unverified` items from verified `content-gap`, `serp-framing`, `ctr`, or `ranking` observations. Review `intentMix` and the source query metrics so a high-impression theme does not get mistaken for a universal user need.

Safe actions are to fix contradictory technical evidence first, improve a clearly missing answer block, test clearer SERP framing when the body already covers the topic, or leave a well-covered page alone. Do not create one thin section per query, force exact-match wording, change the canonical target, or expand content solely to raise the report score.
