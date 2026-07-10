---
name: traffic-anomaly
description: Detect statistically unusual recent GSC movement. Use when an agent needs evidence that recent traffic differs from its baseline.
---

# Traffic anomaly

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `diagnosis` when discovery is needed.
2. Call `seo_describe_report` with id `traffic-anomaly` before supplying parameters.
3. Call `seo_run_report` with id `traffic-anomaly` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Confirm finalized Pacific-date windows, baseline size, recent window, metric, threshold, and source completeness.
- Statistical unusualness does not identify a cause and should not be described as a Google update or site defect.
