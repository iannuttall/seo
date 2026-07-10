---
name: top-fixes
description: Return a bounded technical fix queue from crawl evidence. Use when an agent needs the highest-priority rules before requesting affected URLs.
---

# Top fixes

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `top-fixes` before supplying parameters.
3. Call `seo_run_report` with id `top-fixes` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Reuse a saved report id when possible and check crawl scope, page cap, failures, category filter, and result limit.
- Priority is derived from retained crawl and optional provider evidence. Missing joins must not become false zeros.
