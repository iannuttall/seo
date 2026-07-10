---
name: update-postmortem
description: Compare retained winners and losers around a Google ranking update window. Use it to structure a postmortem while explicitly keeping causation unestablished.
---

# Update postmortem workflow

This workflow organizes performance movement around a known Google update,
including template and segment evidence plus optional local change-log context.
It helps identify where to investigate. Temporal overlap and exposure do not
prove that the update caused any change, and retained winners and losers are not
a complete property inventory when sources are capped or filtered.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "workflows"` and select `update-postmortem`.
2. Call `seo_describe_report` with `id: "update-postmortem"`; inspect the current schema.
3. Call `seo_run_report` with that id and only described parameters.

CLI parity:

```sh
seo reports describe update-postmortem --json
seo reports run update-postmortem --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"limit":10,"includeBrand":false,"knownConfounders":["Site migration on 2026-05-12"],"includeChangeLog":true}' --json
```

Record specific known confounders rather than vague suspicions. The change log
is supporting context, not automatic attribution.

## Interpret and act

Start with workflow step statuses, finalized date windows, source completeness,
failed measurements, retained limits, and caveats. Then inspect `update`,
`insights`, `templateMovement`, and `segments`. Keep positive and negative
movement visible. The report's cause remains not established even when dates
overlap. Compare like-for-like metrics and note brand filtering, invalid rows,
duplicate aggregation, and partial provider results.

Safe next steps are falsifiable: inspect representative URLs from affected
segments, reproduce technical changes, compare deployed templates, validate the
local change log, and measure a bounded intervention. Preserve known
confounders in the handoff. Do not roll back, rewrite, merge, or delete content
solely because it appears among losers. Never claim update causation, recovery
probability, future traffic, or ranking impact from this workflow.

Use MCP `structuredContent` as the machine contract and Markdown only for the
human-readable postmortem.
