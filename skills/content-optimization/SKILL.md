---
name: content-optimization
description: Build a first-party content review for one URL. Use when an agent needs GSC query evidence joined with fetched page observations.
---

# Content optimization

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `ai-search` when discovery is needed.
2. Call `seo_describe_report` with id `content-optimization` before supplying parameters.
3. Call `seo_run_report` with id `content-optimization` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Treat retained query wording, term coverage, and page checks as review heuristics rather than ranking requirements.
- Check provider row limits and content-verification status before proposing an edit.
