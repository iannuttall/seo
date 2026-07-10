---
name: internal-links
description: Find verified internal-link review candidates for one target URL. Use when an agent needs source pages and contextual anchor evidence.
---

# Internal link candidates

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `opportunities` when discovery is needed.
2. Call `seo_describe_report` with id `internal-links` before supplying parameters.
3. Call `seo_run_report` with id `internal-links` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Check attempted, fetched, failed, invalid, excluded, and retained candidate counts plus every configured cap.
- A candidate is not an automatic insertion. Verify context, intent, destination identity, and current link state.
