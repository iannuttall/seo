---
name: audit-urls
description: Audit an explicit bounded URL list. Use when an agent needs technical evidence for a known set of pages without crawling a whole site.
---

# Audit URLs

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `audit-urls` before supplying parameters.
3. Call `seo_run_report` with id `audit-urls` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm how many requested URLs were attempted, fetched, failed, retained, and omitted.
- Raw pages and issues are opt-in. Request only the detail needed for the decision.
