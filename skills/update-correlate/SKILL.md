---
name: update-correlate
description: Overlay finalized GSC anomaly windows with official Google ranking-update dates; use it for timing context while keeping attribution explicitly unestablished.
---

# Add update timing context

Use `update-correlate` only after defining the traffic window you want to
examine. It combines the anomaly analysis with official ranking incident dates
and known local changes. Overlap can make an update a reasonable investigation
context. It cannot show that the update caused a gain or loss, even when the
movement is large and no other change has been recorded.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"diagnosis"}`. Call
`seo_describe_report` with `{"id":"update-correlate"}`, then use
`seo_run_report`, for example
`{"id":"update-correlate","params":{"site":"sc-domain:example.com","days":90,"recentDays":7,"paddingDays":2,"refresh":false}}`.

The same definition is available through the CLI:

```sh
seo reports describe update-correlate --json
seo reports run update-correlate --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"paddingDays":2,"refresh":false}' --json
```

The schema currently types window and padding values as general numbers. Pass
positive whole-day values and avoid excessive padding that makes overlap almost
inevitable.

## Interpret the output

Start with `classification`, but always keep `attribution` and `confidence` in
view. The report intentionally returns attribution as `not-established` and
confidence as `none`. Inspect the underlying `anomalies`, exact
`overlappingUpdates`, and `confounders` before repeating the summary.

Use `evidence` for observed movement and date overlap, `caveats` for window,
padding, freshness, and source limits, and `source` to identify the official
feed. `significant-movement-with-update-overlap` means both facts occurred in
the configured window. `update-overlap-without-significant-movement` is not an
impact result. `no-update-overlap` does not explain any movement that remains.

## Act safely

Test saved deploys, redirects, pruning, blocking, tracking, and content changes
first when they overlap. Use `segment-impact` or the postmortem workflow to map
affected templates and queries. Preserve winning patterns and investigate
losers with page-level evidence. Never describe temporal overlap as a penalty,
reward, recovery, or confirmed algorithm effect.
