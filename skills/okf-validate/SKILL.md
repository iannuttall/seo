---
name: okf-validate
description: Validate supplied OKF Markdown files. Use when an agent needs deterministic structure and manifest checks before using a knowledge bundle.
---

# Validate OKF

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `okf-validate` before supplying parameters.
3. Call `seo_run_report` with id `okf-validate` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Validation checks the supported file contract, not the truth, freshness, ownership, or safety of the content.
- Treat every validation error as file-specific and preserve the original files for correction.
