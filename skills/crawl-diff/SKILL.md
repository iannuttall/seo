---
name: crawl-diff
description: Compare a bounded live crawl with its previous snapshot. Use when an agent needs technical and page changes after a release.
---

# Crawl diff

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `monitoring` when discovery is needed.
2. Call `seo_describe_report` with id `crawl-diff` before supplying parameters.
3. Call `seo_run_report` with id `crawl-diff` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm both runs used comparable scope, limits, rendering, and successful fetches.
- A bounded or failed run cannot support an inventory-wide added, removed, or resolved claim.
