---
name: ai-search-scorecard
description: Score AI-search technical readiness 0-100 from one crawl using this tool's own weighted checks, keeping observed evidence, unknown states, and a partial flag separate. Use when you want a single scored summary of the AI-search evidence this package already collects.
---

# Score AI-search readiness

This report bundles the AI-search and AEO evidence the crawler already collects into one deterministic 0-100 scorecard. The score is a heuristic summary of this tool's own checks. It is not a Google or AI-engine requirement, an eligibility verdict, a ranking predictor, or a forecast of citations, indexing, visibility, or traffic. Use it to get a compact read on where the technical evidence is strong, mixed, or missing, then open the focused reports for page-level fixes.

## Run it

For MCP, call `seo_list_reports` with category `ai-search` if the report id is not already known. Call `seo_describe_report` with `{ "id": "ai-search-scorecard" }`, then `seo_run_report` with:

```json
{
  "id": "ai-search-scorecard",
  "params": { "reportId": "crawl_example_20260710" }
}
```

Read `structuredContent` after confirming `isError` is false. The equivalent CLI flow is:

```sh
seo reports describe ai-search-scorecard --json
seo reports run ai-search-scorecard --params '{"reportId":"crawl_example_20260710"}' --json
```

Supplying `url` instead of `reportId` starts a fresh crawl. Reusing a saved crawl report keeps the scorecard comparable with the other crawl-derived reports.

## Read the evidence in order

Start with `partial`, `crawlComplete`, and `excluded` before you trust the number. `score` is `null` when no check had known evidence. A partial or incomplete crawl cannot reach a clean 100, so a capped 99 signals the crawl was not whole-site.

Then read `checks`. Each check carries a `status` of pass, warn, fail, or unknown, an `observed` object with the raw evidence, a derived `finding`, and a bounded `verification` step. `unknown` means the evidence was unavailable; it is excluded from the score and is never counted as a failure. The `methodology` block gives the exact per-check `weights`, the `statusCredit` map, the `formula`, and a versioned id so another program can reproduce the number.

The `observations` list holds llms.txt, agent descriptors, and snippet directives. These are intentional or optional signals, so they are reported as context and left out of the score.

## What not to claim

Never turn this score into a statement about indexing, rankings, selection, citations, AI visibility, or traffic. A blocked AI crawler token can be an intentional publisher choice, so confirm intent before treating the robots check as a defect. Verify any change with a fresh crawl at the same scope, and use `ai-readiness`, `geo-gaps`, or `entity-readiness` when you need the underlying per-page evidence.
