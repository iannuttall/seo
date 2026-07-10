---
name: workflow-monthly-report
description: Run the monthly reporting workflow. Use when an agent needs a monthly narrative plus explicit next actions.
---

# Monthly workflow

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `workflows` when discovery is needed.
2. Call `seo_describe_report` with id `workflow-monthly-report` before supplying parameters.
3. Call `seo_run_report` with id `workflow-monthly-report` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm the finalized month, provider status, skipped sections, warnings, caveats, and action evidence.
- Observed monthly movement does not justify a cause, forecast, or guaranteed outcome.
