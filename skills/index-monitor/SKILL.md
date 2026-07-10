---
name: index-monitor
description: Run bounded sitemap-driven URL Inspection monitoring. Use when an agent needs oldest-first indexed-snapshot checks under a local quota limit.
---

# Index monitor

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `monitoring` when discovery is needed.
2. Call `seo_describe_report` with id `index-monitor` before supplying parameters.
3. Call `seo_run_report` with id `index-monitor` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Separate selected, unselected due, fresh, stale, failed, quota-blocked, deferred, and never-attempted URLs.
- URL Inspection returns Google indexed snapshots for sampled URLs, not a live crawl or inventory-wide status.
