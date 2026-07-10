---
name: decaying
description: Find observed click declines across retained GSC windows. Use when an agent needs a bounded investigation queue for lost search demand.
---

# Decaying queries and pages

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `opportunities` when discovery is needed.
2. Call `seo_describe_report` with id `decaying` before supplying parameters.
3. Call `seo_run_report` with id `decaying` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm equal finalized windows, comparison mode, retained rows, invalid rows, and source completeness.
- Returned signals suggest checks to run. They do not prove what caused the decline.
