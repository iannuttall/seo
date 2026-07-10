---
name: second-page
description: Find URLs with retained GSC average positions above 10 through 20. Use when an agent needs evidence-grounded investigation prompts.
---

# Second-page opportunities

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `reporting` when discovery is needed.
2. Call `seo_describe_report` with id `second-page` before supplying parameters.
3. Call `seo_run_report` with id `second-page` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Average position is an aggregate observation, not an exact rank for every search or day.
- Check retained rows, brand filters, impression thresholds, duplicate aggregation, and content-verification caps.
