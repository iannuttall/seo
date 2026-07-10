---
name: page-opportunities
description: Review one URL against retained GSC demand, peer CTR evidence, and live page content; use when an agent needs query-level opportunities with verification and source limits intact.
---

# Page opportunities

Use this report to investigate how one page performs for the query/page rows retained by Search Console. It compares the target rows with a bounded site-wide peer sample and can fetch the live page to distinguish covered, unverified, technical, framing, ranking, and possible content-gap observations. It does not expose anonymized queries, explain ranking causes, or prove that a benchmark shortfall is recoverable traffic.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"ai-search"}`.
2. Call `seo_describe_report` with `{"id":"page-opportunities"}`.
3. Call `seo_run_report` with `{"id":"page-opportunities","params":{"site":"sc-domain:example.com","url":"https://example.com/pricing","days":90,"limit":15,"minImpressions":40,"verifyContent":true}}`.

The CLI shares that schema and implementation:

```sh
seo reports describe page-opportunities --json
seo reports run page-opportunities --params '{"site":"sc-domain:example.com","url":"https://example.com/pricing","days":90,"limit":15,"minImpressions":40,"verifyContent":true}' --json
```

`site` and `url` are required. Use `includeBrand:true` only when branded demand belongs in the decision. `verifyContent:false` saves a fetch but makes content-specific conclusions unavailable.

## Interpret and act

Check `dataStatus`, `range`, `source.targetRowsFetched`, `selection`, and `benchmark` first. A `benchmark.possiblyTruncated` value of true means the peer sample reached its cap. Read `verification.status` and `reason`; only `verified` results support live-page coverage observations. For each `item`, retain the query metrics, opportunity type, benchmark evidence, verification evidence, and recommendation together. `estimatedCtrClickShortfall` is a directional calculation, not a click forecast, and `summary.opportunities` is a review queue rather than a defect count.

Safe actions include inspecting the live SERP, resolving status/indexability contradictions, testing title or description framing when the page already answers the query, strengthening a relevant answer, and adding a contextual internal link. Do not rewrite a page from query wording alone, infer an all-clear from partial data, or merge and delete pages without separate intent, canonical, and internal-link evidence.
