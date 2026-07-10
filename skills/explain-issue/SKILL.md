---
name: explain-issue
description: Explain one crawler rule. Use when an agent needs the rule meaning, fix guidance, or a verification step for a known rule id.
---

# Explain issue

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `crawl` when discovery is needed.
2. Call `seo_describe_report` with id `explain-issue` before supplying parameters.
3. Call `seo_run_report` with id `explain-issue` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Rule guidance explains the check. It does not prove that the rule applies to a particular URL.
- Pair the explanation with affected URL evidence from the same crawl before creating implementation work.
