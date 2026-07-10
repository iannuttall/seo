---
name: ctr-underperformers
description: Find retained GSC queries below a position-based CTR benchmark. Use when an agent needs a snippet review queue.
---

# CTR underperformers

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `opportunities` when discovery is needed.
2. Call `seo_describe_report` with id `ctr-underperformers` before supplying parameters.
3. Call `seo_run_report` with id `ctr-underperformers` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- CTR benchmarks and click shortfalls are prioritisation heuristics, not traffic forecasts.
- Check duplicate aggregation, invalid rows, retained row limits, position, device, query intent, and SERP layout.
