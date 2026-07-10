---
name: index-coverage-plan
description: Plan URL Inspection allocation across Search Console properties. Use when an agent needs a quota-aware sitemap monitoring design.
---

# Index coverage plan

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `monitoring` when discovery is needed.
2. Call `seo_describe_report` with id `index-coverage-plan` before supplying parameters.
3. Call `seo_run_report` with id `index-coverage-plan` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Check sitemap fetch failures, invalid URLs, deduplication, inventory caps, and property ownership.
- This is an allocation plan. It does not inspect URLs or report index coverage.
