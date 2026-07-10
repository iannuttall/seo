---
name: workflow-technical-watch
description: Run crawl-diff and URL Inspection monitoring together. Use when an agent needs a bounded recurring technical review.
---

# Technical watch workflow

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `workflows` when discovery is needed.
2. Call `seo_describe_report` with id `workflow-technical-watch` before supplying parameters.
3. Call `seo_run_report` with id `workflow-technical-watch` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Read crawl, index, sitemap, quota, recovery, failure, and skipped-section states independently.
- URL Inspection is an indexed snapshot and crawl diff is bounded. Neither supports an inventory-wide all-clear when partial.
