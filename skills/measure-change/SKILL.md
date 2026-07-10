---
name: measure-change
description: Measure the before-and-after impact of a saved or ad hoc SEO change with equal finalized Google Search Console windows, optional GA4 landing-page evidence, and an optional control. Use when an agent needs to evaluate a release, page edit, migration, template change, or SEO test without mistaking an incomplete after-period for a decline.
---

# Measure SEO change

Call `seo_list_reports` with category `experiments` when discovery is needed.
Call `seo_describe_report` with id `measure-change`, then call `seo_run_report`
with that id and only the described parameters. Read `structuredContent` as the
machine contract. Use the CLI for CI, saved JSON, or environments without MCP.

```bash
seo reports describe measure-change --json
seo reports run measure-change --params '{"site":"sc-domain:example.com","scope":"page","target":"https://example.com/page","title":"Updated page","changedAt":"2025-10-01","beforeDays":28,"afterDays":28}' --json

seo tests report \
  --project <project> \
  --scope page \
  --target https://example.com/page \
  --date 2026-06-01 \
  --before 28 \
  --after 28 \
  --json
```

Describe the report before building ad hoc parameters because the schema keeps
saved-test and inline-test inputs in one contract. The catalog runner and the
focused command execute the same measurement logic.

For a saved test, pass its `id` instead of the ad hoc site, scope, target, and date fields.

## Workflow

1. Use the same whole-number duration for `beforeDays` and `afterDays`. Raw totals from unequal calendar windows are not comparable.
2. Read `dataStatus`, `window`, `source`, `warnings`, and `caveats` before interpreting metrics.
3. Confirm `window.effectiveDays` equals `window.requestedDays`. If `afterWindowTruncated` is true, the tool uses an equal shortened baseline, returns `partial`, and withholds a directional verdict.
4. Require at least 7 finalized days in each window for a directional verdict. Shorter complete windows remain useful observations but return `not-enough-data`.
5. Treat GSC clicks, impressions, CTR, and impression-weighted average position as observed before/after evidence. Timing does not prove that the recorded change caused the movement.
6. For query-scoped tests, treat `retained-query-date-aggregates` as partial. A missing retained window returns null metrics and is not a zero or a loss.
7. If GA4 is present, check its property timezone and `source.analytics.status`. GA4 day boundaries can differ from GSC Pacific dates; sampling, thresholding, or `(other)` grouping makes GA4 evidence partial.
8. Use a control only when it represents a credible unaffected comparison. Adjusted deltas use a control-ratio counterfactual, not raw subtraction across differently sized groups.
9. Investigate query mix, devices, countries, indexability, SERP changes, seasonality, and other releases before recommending a rollout or reversal.

## Interpretation rules

- Never call `not-enough-data` positive, negative, or flat.
- Never annualize or forecast the observed delta.
- Do not compare this run with another run that used different effective window lengths.
- `clickPct: null` means the before value was zero; it is not an infinite percentage gain.
- A partial GA4 source does not invalidate complete GSC evidence, but it does limit analytics conclusions.
- Provider, auth, property, and invalid-date errors are failures, not zero movement.
