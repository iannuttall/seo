---
name: crawl-site
description: Crawl a site for technical SEO evidence. Use when an agent needs a bounded site inventory, issue summary, or saved crawl report.
---

# Crawl site

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `crawl-site` before supplying parameters.
3. Call `seo_run_report` with id `crawl-site` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Read pageLimitReached, attempted and fetched counts, failures, warnings, and caveats before sitewide conclusions.
- Keep raw pages and issues opt-in. Respect robots behavior and disclose when JavaScript rendering was not used.
