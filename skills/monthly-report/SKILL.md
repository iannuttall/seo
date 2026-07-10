---
name: monthly-report
description: Generate one monthly SEO narrative. Use when an agent needs finalized GSC evidence, measured changes, caveats, and next actions for a calendar month.
---

# Monthly report

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `reporting` when discovery is needed.
2. Call `seo_describe_report` with id `monthly-report` before supplying parameters.
3. Call `seo_run_report` with id `monthly-report` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm the report month, finalized data window, section status, content-verification status, and source completeness.
- Keep observed movement separate from explanations and do not forecast clicks, traffic, revenue, or rankings.
