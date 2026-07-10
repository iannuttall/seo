---
name: list-rules
description: List crawler rule ids and guidance metadata. Use when an agent needs to discover a valid rule before requesting an explanation or affected URLs.
---

# List rules

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `list-rules` before supplying parameters.
3. Call `seo_run_report` with id `list-rules` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Rule availability does not mean the current site triggered the rule.
- Filter by category when possible and request detail for one rule at a time.
