---
name: workflow-refresh-priorities
description: Rank several first-party opportunity reports into one action queue. Use when an agent needs current decay, position, CTR, exposure, diagnosis, and optional GA4 evidence.
---

# Refresh priorities workflow

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `workflows` when discovery is needed.
2. Call `seo_describe_report` with id `workflow-refresh-priorities` before supplying parameters.
3. Call `seo_run_report` with id `workflow-refresh-priorities` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Preserve each item source, method, date window, completeness, verification status, and priority rationale.
- Signals from different reports are not interchangeable measurements. Missing sections must remain visible.
