---
name: llms-txt-audit
description: Inspect optional llms.txt evidence from a crawl. Use when an agent needs presence, fetch, format, or candidate-page observations.
---

# Audit llms.txt

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `llms-txt-audit` before supplying parameters.
3. Call `seo_run_report` with id `llms-txt-audit` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Treat llms.txt as optional agent metadata, not a Google Search requirement or ranking signal.
- Check the saved crawl date, fetch status, cap, and candidate selection before describing coverage.
