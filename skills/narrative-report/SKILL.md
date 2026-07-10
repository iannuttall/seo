---
name: narrative-report
description: Assemble diagnosis, change measurement, and monitoring evidence into a readable SEO narrative. Use it for an evidence-linked briefing rather than a new source of truth.
---

# Report narrative

This report turns several structured analyses into a coherent explanation. It
is useful when a person needs the important findings, caveats, and next actions
without reading every raw section. The narrative summarizes evidence; it does
not strengthen weak evidence, prove causation, or make missing and partial data
complete.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "reporting"` and select `narrative-report`.
2. Call `seo_describe_report` with `id: "narrative-report"` before constructing parameters.
3. Call `seo_run_report` with `id: "narrative-report"` and schema-valid parameters.

CLI parity:

```sh
seo reports describe narrative-report --json
seo reports run narrative-report --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"limit":10,"includeBrand":false,"changeLimit":5}' --json
```

Use explicit date bounds only when the described schema supports the intended
window; otherwise `days` and `recentDays` keep comparisons consistent.
`changeLimit` bounds attempted change measurements, while `limit` bounds
retained report items.

## Interpret and act

Read `headline` only after checking top-level caveats. Then inspect `sections`,
`priorities`, `diagnosis`, `changeMeasurements`,
`changeMeasurementAttempts`, and `monitoring`. A failed or skipped measurement
must stay visible; it is not a zero. Preserve each section's dates,
completeness, thresholds, limits, and evidence references. Treat update timing,
template groupings, and opportunity scores as investigation context, not
ranking causes.

Safe actions should trace back to observed evidence: reproduce a technical
failure, inspect the affected URLs, validate an intentional control, or run a
bounded content change with a recorded date. Keep recommended verification
steps separate from asserted defects. Do not invent traffic lift, rank gains,
revenue impact, or certainty that the source does not provide.

MCP `structuredContent` is the machine contract. Returned Markdown is for human
communication and should not replace the underlying JSON evidence.
