---
name: quick-wins
description: Find high-impression ranking and CTR review candidates. Use when an agent needs a bounded first-party opportunity queue.
---

# Quick wins

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `opportunities` when discovery is needed.
2. Call `seo_describe_report` with id `quick-wins` before supplying parameters.
3. Call `seo_run_report` with id `quick-wins` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Position bands, CTR targets, and calculated shortfalls are prioritisation heuristics rather than traffic forecasts.
- Check GSC row retention, brand filters, content-verification caps, invalid rows, and query intent.
