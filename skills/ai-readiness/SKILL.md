---
name: ai-readiness
description: Review local AI-search readiness evidence. Use when an agent needs technical eligibility observations without a citation prediction.
---

# AI readiness

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `ai-readiness` before supplying parameters.
3. Call `seo_run_report` with id `ai-readiness` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Treat crawl indexability, bot access, snippet controls, and page observations as separate evidence.
- This report does not prove Google indexing, AI visibility, citations, or selection.
