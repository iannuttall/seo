---
name: entity-readiness
description: Review entity-related site observations. Use when an agent needs schema, sameAs, social, author, date, or naming evidence from a crawl.
---

# Entity readiness

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `entity-readiness` before supplying parameters.
3. Call `seo_run_report` with id `entity-readiness` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- These are page and crawl observations. They do not prove Knowledge Graph recognition, authority, or AI visibility.
- Check crawl completeness and distinguish missing evidence from an evaluated negative result.
