---
name: link-recover
description: Find search-value URLs that now fail technical checks. Use when an agent needs broken, blocked, or poor-redirect recovery candidates.
---

# Link recovery

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `monitoring` when discovery is needed.
2. Call `seo_describe_report` with id `link-recover` before supplying parameters.
3. Call `seo_run_report` with id `link-recover` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Join retained GSC evidence with current fetch and redirect evidence, and disclose limits or failed checks.
- Observed clicks or impressions help priority. They do not prove that a redirect or restoration will recover traffic.
