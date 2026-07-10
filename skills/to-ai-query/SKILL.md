---
name: to-ai-query
description: Convert retained GSC wording into deterministic monitoring prompts. Use when an agent needs a bounded first-party prompt suggestion set.
---

# Queries to AI prompts

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `ai-search` when discovery is needed.
2. Call `seo_describe_report` with id `to-ai-query` before supplying parameters.
3. Call `seo_run_report` with id `to-ai-query` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Generated prompts are suggestions, not queries observed in an AI product and not evidence of AI demand.
- Store the source query, date range, filters, completeness, and prompt wording with any external monitoring result.
