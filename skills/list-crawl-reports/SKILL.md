---
name: list-crawl-reports
description: List saved crawl metadata. Use when an agent needs a report id for a compact follow-up or comparison.
---

# List crawl reports

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `list-crawl-reports` before supplying parameters.
3. Call `seo_run_report` with id `list-crawl-reports` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Treat this as local metadata discovery, not a fresh site check.
- Use the site filter and limit, then load only the report needed for the task.
