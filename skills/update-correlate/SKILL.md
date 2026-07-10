---
name: update-correlate
description: Compare recent GSC movement with official Google ranking update windows. Use when an agent needs timing context for an observed anomaly.
---

# Update correlation

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `diagnosis` when discovery is needed.
2. Call `seo_describe_report` with id `update-correlate` before supplying parameters.
3. Call `seo_run_report` with id `update-correlate` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Report exact update windows, padding, traffic windows, source completeness, and whether overlap exists.
- Timing overlap is context, not proof that the update caused the movement.
