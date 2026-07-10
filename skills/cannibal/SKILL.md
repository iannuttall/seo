---
name: cannibal
description: Find queries exposed across multiple URLs. Use when an agent needs candidates for intent, canonical, and internal-link review.
---

# Cannibal exposure

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `opportunities` when discovery is needed.
2. Call `seo_describe_report` with id `cannibal` before supplying parameters.
3. Call `seo_run_report` with id `cannibal` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Multiple ranking URLs are observed exposure, not automatically harmful cannibalisation.
- Check retained GSC completeness, invalid rows, query limits, and URL evidence before recommending consolidation.
