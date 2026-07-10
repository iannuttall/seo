---
name: get-crawl-report
description: Load one saved crawl report. Use when an agent needs compact follow-up evidence without crawling the site again.
---

# Get crawl report

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `get-crawl-report` before supplying parameters.
3. Call `seo_run_report` with id `get-crawl-report` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm the report id, creation time, site, configuration, and storage schema before comparing it with another run.
- Pages and issue inventories are opt-in and may still reflect a capped or partial original crawl.
