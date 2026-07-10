---
name: traffic-anomaly
description: Test whether recent finalized GSC clicks or impressions differ unusually from an observed baseline; use it to confirm movement before investigating possible causes.
---

# Detect unusual traffic movement

Use `traffic-anomaly` when a dashboard looks different and you need a
repeatable check against recent history. It compares a recent finalized GSC
window with an observed baseline for clicks and impressions. Statistical
unusualness helps decide whether deeper investigation is warranted. It does not
identify a cause, diagnose a site defect, or prove that an external event
affected the property.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"diagnosis"}`. Call
`seo_describe_report` with `{"id":"traffic-anomaly"}` before choosing windows.
Then call `seo_run_report`, for example
`{"id":"traffic-anomaly","params":{"site":"sc-domain:example.com","days":90,"recentDays":7,"refresh":false}}`.

CLI parity uses the same report definition:

```sh
seo reports describe traffic-anomaly --json
seo reports run traffic-anomaly --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"refresh":false}' --json
```

The discovery schema currently exposes broad numeric types for these window
fields. Use sensible positive whole-day values even though all bounds are not
expressed in JSON Schema.

## Interpret the output

Read `coverage` first. Confirm the requested dates, expected and observed days,
missing days, invalid rows, duplicate rows, and `status`. Partial coverage can
change the baseline and must stay in the conclusion. `rows` is not a quality
verdict.

Each entry in `anomalies` names the metric, baseline and comparison dates,
means and totals, `percentChange`, `zScore`, `significanceMethod`, `direction`,
and `significant`. A null percentage from a zero baseline is different from
zero change. `outside-flat-baseline` handles movement where an observed
baseline has no variance; it still describes only the supplied data.

## Act safely

If movement is significant and coverage is adequate, run `segment-impact` for
pages and queries, then check site changes, seasonality, indexing, and tracking.
If it is normal, keep monitoring rather than forcing a story. Never label the
result a penalty, algorithm update, recovery, or causal diagnosis without
independent evidence.
