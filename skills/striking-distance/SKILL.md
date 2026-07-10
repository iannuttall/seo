---
name: striking-distance
description: Find retained GSC query and page rows averaging positions 11 through 20. Use when an agent needs a bounded review queue near page one.
---

# Striking distance

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `diagnosis` when discovery is needed.
2. Call `seo_describe_report` with id `striking-distance` before supplying parameters.
3. Call `seo_run_report` with id `striking-distance` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Average position and impression thresholds are prioritisation heuristics, not stable ranks or traffic forecasts.
- Check retained rows, brand filters, duplicates, invalid rows, content-verification caps, and query intent.
