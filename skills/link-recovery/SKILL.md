---
name: link-recovery
description: Join retained GSC page value with current redirect and indexability checks; use it to prioritise previously visible URLs that may now be broken or misdirected.
---

# Recover search-value URLs

Use `link-recovery` to find retained GSC page rows with prior clicks or
impressions whose current fetch path ends in a technical problem. This joins
historical search observations with a present redirect trace, which is useful
for triage after migrations or URL changes. Prior visibility helps order the
queue. It does not prove that fixing a URL will restore the same traffic.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"monitoring"}`, call
`seo_describe_report` with `{"id":"link-recovery"}`, then use `seo_run_report`.
Example:
`{"id":"link-recovery","params":{"site":"sc-domain:example.com","days":90,"limit":25,"minClicks":1,"minImpressions":100,"js":false,"refresh":true}}`.

The CLI has the same schema:

```sh
seo reports describe link-recovery --json
seo reports run link-recovery --params '{"site":"sc-domain:example.com","days":90,"limit":25,"minClicks":1,"minImpressions":100,"refresh":true}' --json
```

The discovery schema currently exposes broad number types. Use positive whole
days and bounded non-negative thresholds.

## Interpret the output

Confirm `range` and `summary.checked` before reading recoverable counts. The
summary separates high, medium, and low severity and totals observed clicks and
impressions for affected retained rows. Those `clicksAtRisk` and
`impressionsAtRisk` values describe the checked period; they are not a forecast
of future loss or recovery.

Each item preserves the original URL, final URL, GSC metrics, primary and full
issue lists, severity, the redirect `trace`, and a recommendation with evidence,
effort, and confidence. Inspect chain status, final-page indexability,
canonicals, and warnings directly. Failed checks, selection limits, or retained
GSC rows outside the returned set constrain coverage.

## Act safely

Restore a page only when it should still exist. Otherwise add one direct 301 to
the closest equivalent destination and align its canonical after verifying
intent. Fix server errors and accidental noindex controls before content work.
Do not redirect unrelated URLs to a homepage, remove intentional controls, or
promise traffic recovery from historical metrics.
