---
name: audit-page
description: Audit one fetched page. Use when an agent needs focused technical, metadata, content, link, or structured-data evidence for one URL.
---

# Audit page

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `reporting` when discovery is needed.
2. Call `seo_describe_report` with id `audit-page` before supplying parameters.
3. Call `seo_run_report` with id `audit-page` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Keep fetched observations separate from derived findings and note fetch or rendering failures.
- One page cannot support a sitewide claim. Title width, heading shape, and content checks remain review evidence.
