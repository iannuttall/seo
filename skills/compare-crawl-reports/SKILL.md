---
name: compare-crawl-reports
description: Compare two saved crawls. Use when an agent needs page, issue, score, and technical change evidence between snapshots.
---

# Compare crawl reports

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `compare-crawl-reports` before supplying parameters.
3. Call `seo_run_report` with id `compare-crawl-reports` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Compare crawl configuration, scope, page caps, and failed fetches before attributing a difference to the site.
- A URL absent from one capped or partial crawl is not proof that the page was added or removed.
