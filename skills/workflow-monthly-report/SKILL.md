---
name: workflow-monthly-report
description: Run a calendar-month reporting workflow with a narrative and explicit actions. Use it for a repeatable review whose caveats remain attached to each measurement.
---

# Monthly workflow

This workflow packages the monthly narrative into a sequenced, agent-friendly
result with explicit steps and actions. It helps keep recurring reviews
consistent. It can report measured movement, but it cannot establish a cause,
promise recovery, or turn incomplete provider evidence into a full-property
conclusion.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "workflows"` and select `workflow-monthly-report`.
2. Call `seo_describe_report` with `id: "workflow-monthly-report"`; confirm its current parameters.
3. Call `seo_run_report` with that id and only schema-valid parameters.

CLI parity:

```sh
seo reports describe workflow-monthly-report --json
seo reports run workflow-monthly-report --params '{"site":"sc-domain:example.com","month":"2026-05","limit":10,"includeBrand":false}' --json
```

Supply `month` as `YYYY-MM`. `limit` controls retained output, not the provider's
underlying completeness. Keep `includeBrand` explicit when comparisons must be
reproducible across months.

## Interpret and act

Inspect the workflow envelope: `summary`, each entry in `steps`, `actions`, and
the nested `output`. Confirm the requested month, final-data window, provider
status, skipped sections, warnings, caveats, and retained caps. Follow narrative
claims back into their structured diagnosis or measurement. A skipped section
is not a zero, and a top-level successful workflow does not make every nested
source complete.

Use actions as a review queue, not automatic edit instructions. Verify affected
URLs and intentional controls, reproduce technical defects, and record any
approved changes for future measurement. Keep month-over-month movement
separate from explanations. Do not invent click, traffic, ranking, or revenue
forecasts, and do not attribute movement to an algorithm update or deployment
from timing alone.

Read MCP `structuredContent` as the machine contract. The rendered Markdown is
the human brief, not an alternative data source for agents.
