---
name: workflow-diagnose-property
description: Run the full property diagnosis as a sequenced workflow with evidence and actions. Use it for a broad first pass while keeping every component report independently qualified.
---

# Diagnosis workflow

Use this workflow for the first broad review of a Search Console property. It
coordinates diagnosis, produces a compact summary, and turns supported findings
into next steps. It does not make every section complete, merge different
source semantics into one metric, or prove why observed search performance
changed.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "workflows"` and select `workflow-diagnose-property`.
2. Call `seo_describe_report` with `id: "workflow-diagnose-property"` and inspect its schema.
3. Call `seo_run_report` with that id and only schema-valid parameters.

CLI parity:

```sh
seo reports describe workflow-diagnose-property --json
seo reports run workflow-diagnose-property --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"limit":10,"includeBrand":false}' --json
```

`days` sets the main evidence window and `recentDays` sets the recent comparison
period. `limit` bounds retained items; it does not increase provider coverage.

## Interpret and act

Read the workflow envelope first: `workflow`, `site`, `generatedAt`, `summary`,
`steps`, `actions`, and `output`. Every step has its own status and evidence.
Then inspect the diagnosis `dataStatus`, skipped sections, partial reasons,
priorities, and nested anomaly, update, segment, decay, cannibalisation,
striking-distance, and quick-win results. Do not let one complete section hide a
failed or capped neighbour.

Start with actions that cite reproducible evidence. Confirm affected URLs,
provider dates, selection limits, and intentional technical controls before
editing anything. Run a focused report to inspect detail rather than asking this
broad workflow for a larger payload. Sparse data may legitimately skip a
section. Update overlap, opportunity scores, average position, and timing are
investigation signals, not causation or forecasts.

Treat MCP `structuredContent` as the machine contract. Use Markdown for the
human summary while preserving structured evidence references in any handoff.
