---
name: quick-wins
description: Rank retained position 4-10 GSC query-page rows below a site-aware CTR target; use when an agent needs a bounded opportunity queue with optional live-content verification.
---

# Quick wins

Use this report to prioritise retained query/page rows with meaningful impressions, average positions from 4 through 10, and CTR below a leave-target-out site benchmark or documented fallback curve. Optional page verification checks whether the live page covers the query or presents technical evidence before recommending a content action. “Quick win” describes the review queue, not effort, certainty, or expected traffic.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"opportunities"}`.
2. Call `seo_describe_report` with `{"id":"quick-wins"}`.
3. Call `seo_run_report` with `{"id":"quick-wins","params":{"site":"sc-domain:example.com","days":90,"limit":20,"minImpressions":100,"verifyContent":true,"verifyLimit":5}}`.

The CLI calls the same definition:

```sh
seo reports describe quick-wins --json
seo reports run quick-wins --params '{"site":"sc-domain:example.com","days":90,"limit":20,"minImpressions":100,"verifyContent":true,"verifyLimit":5}' --json
```

`site` is required. `limit` bounds returned rows and `verifyLimit` bounds live page checks. Use `js:true` and higher fetch rates only when needed and permitted.

## Interpret and act

Check `dataStatus`, date range, source row cap, `possiblyTruncated`, `selection.invalidRows`, filters, and limited rows. Read `methodology` and each item's benchmark confidence before using `targetCtr`. `estimatedCtrClickShortfall` and priority score are heuristics, explicitly not estimated lift. Inspect `verification.requested`, attempted, verified, failed, and technical counts. An unverified item still has GSC evidence but cannot support a content-coverage conclusion. Review groups and template patterns for repeated hypotheses without converting their sums into forecasts.

Safe actions are to inspect the live SERP, resolve technical conflicts, test clearer snippet framing, improve a genuinely missing answer, or add a relevant internal link. Record the change and compare a later complete window. Do not promise clicks, force query wording into copy, treat average position as a stable rank, or call filtered or capped evidence an all-clear.
