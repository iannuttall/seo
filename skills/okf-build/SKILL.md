---
name: okf-build
description: Build a compact OKF site knowledge bundle. Use when an agent needs a bounded manifest and optional Markdown files from crawl evidence.
---

# Build OKF

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `okf-build` before supplying parameters.
3. Call `seo_run_report` with id `okf-build` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Check the crawl cap, concept limit, included file count, omissions, and source report id.
- Generated knowledge reflects the crawl snapshot and still needs factual, access, and freshness review.
