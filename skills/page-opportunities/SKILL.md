---
name: page-opportunities
description: Find first-party opportunities for one URL. Use when an agent needs retained GSC demand joined with page content observations.
---

# Page opportunities

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `ai-search` when discovery is needed.
2. Call `seo_describe_report` with id `page-opportunities` before supplying parameters.
3. Call `seo_run_report` with id `page-opportunities` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Check GSC completeness, query limits, content-verification status, invalid rows, and caveats.
- Estimated shortfalls and term checks are prioritisation heuristics, not forecasts or ranking requirements.
