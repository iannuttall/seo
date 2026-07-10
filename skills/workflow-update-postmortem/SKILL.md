---
name: workflow-update-postmortem
description: Analyze winners and losers around a Google ranking update window. Use when an agent needs bounded post-update investigation evidence.
---

# Update postmortem workflow

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `workflows` when discovery is needed.
2. Call `seo_describe_report` with id `workflow-update-postmortem` before supplying parameters.
3. Call `seo_run_report` with id `workflow-update-postmortem` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm finalized windows, update dates, retained rows, caps, failed measurements, change-log evidence, and known confounders.
- Exposure and timing do not prove causation. Report winners and losers only within the measured retained evidence.
