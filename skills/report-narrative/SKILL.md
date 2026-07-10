---
name: report-narrative
description: Generate a readable SEO narrative from diagnosis, changes, and monitoring evidence. Use when an agent needs measured findings and next actions.
---

# Report narrative

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `reporting` when discovery is needed.
2. Call `seo_describe_report` with id `report-narrative` before supplying parameters.
3. Call `seo_run_report` with id `report-narrative` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Keep observations, derived findings, measured changes, skipped sections, and caveats visible in the narrative.
- Do not turn update overlap, timing, heuristics, or missing data into causation or a forecast.
