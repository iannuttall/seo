---
name: diagnose-property
description: Run the complete property diagnosis. Use when an agent needs anomaly, update, segment, decay, cannibal, and opportunity evidence in one report.
---

# Diagnose property

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `diagnosis` when discovery is needed.
2. Call `seo_describe_report` with id `diagnose-property` before supplying parameters.
3. Call `seo_run_report` with id `diagnose-property` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Inspect every section status, skipped reason, source window, warnings, and caveats before summarising.
- A failed or sparse section should not erase valid evidence from another section or become a false zero.
