---
name: ai-referrals
description: Find known AI referral traffic in GA4. Use when an agent needs observed landing-page and source evidence from Analytics.
---

# AI referrals

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `ai-search` when discovery is needed.
2. Call `seo_describe_report` with id `ai-referrals` before supplying parameters.
3. Call `seo_run_report` with id `ai-referrals` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Check the GA4 property, date range, source status, retained row count, and warnings before using totals.
- A referral session is observed traffic. Missing referrals do not prove that an AI product never cited the site.
