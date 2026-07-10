---
name: geo-gaps
description: Return technical AI-search eligibility gaps from crawl evidence. Use when an agent needs affected URLs for access, indexability, response, or snippet controls.
---

# GEO gaps

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `geo-gaps` before supplying parameters.
3. Call `seo_run_report` with id `geo-gaps` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Keep technical blockers separate from optional page observations and protocol files.
- No detected restriction does not prove indexing, selection, visibility, or citation by an AI product.
