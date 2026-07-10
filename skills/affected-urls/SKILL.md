---
name: affected-urls
description: Return affected URLs from a crawl report. Use when an agent needs the exact pages behind one technical finding.
---

# Affected URLs

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `affected-urls` before supplying parameters.
3. Call `seo_run_report` with id `affected-urls` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Reuse a saved report id when possible so follow-up counts stay tied to the same crawl.
- Check the rule, category, severity, result limit, and crawl cap before treating the returned set as complete.
