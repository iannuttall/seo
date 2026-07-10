---
name: performance-audit
description: Audit one URL with Lighthouse and optional CrUX. Use when an agent needs lab diagnostics, field Core Web Vitals, or fallback fetch evidence.
---

# Performance audit

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `ai-search` when discovery is needed.
2. Call `seo_describe_report` with id `performance-audit` before supplying parameters.
3. Call `seo_run_report` with id `performance-audit` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Keep Lighthouse lab metrics, CrUX field metrics, and unscored fetch fallback evidence separate.
- Check device, URL versus origin scope, collection period, coverage, failed requests, and metric availability.
