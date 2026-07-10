---
name: doctor
description: Check local seo auth and configuration. Use when an agent needs to diagnose setup, scopes, defaults, or local credentials before running reports.
---

# Doctor

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `setup` when discovery is needed.
2. Call `seo_describe_report` with id `doctor` before supplying parameters.
3. Call `seo_run_report` with id `doctor` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Treat failures as setup problems, not SEO findings.
- Do not expose tokens, client secrets, private keys, or local credential payloads in the answer.
