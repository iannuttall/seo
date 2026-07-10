---
name: llms-txt-generate
description: Generate an llms.txt draft from crawl evidence. Use when an agent needs a bounded agent-readable site summary for human review.
---

# Generate llms.txt

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `llms-txt-generate` before supplying parameters.
3. Call `seo_run_report` with id `llms-txt-generate` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Respect URL and token budgets and disclose omitted candidates from a capped crawl.
- The draft must be checked for factual accuracy, current URLs, access controls, and publisher intent before publication.
