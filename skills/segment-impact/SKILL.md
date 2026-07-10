---
name: segment-impact
description: Compare retained GSC movement by page, query, device, or country. Use when an agent needs the segments associated with an observed change.
---

# Segment impact

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `diagnosis` when discovery is needed.
2. Call `seo_describe_report` with id `segment-impact` before supplying parameters.
3. Call `seo_run_report` with id `segment-impact` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Require adjacent equal-length finalized windows and inspect matched, unmatched, invalid, limited, and retained rows.
- Missing segment rows are not zero. Movement by segment does not establish its cause.
