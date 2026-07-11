---
name: ai-referrals
description: Measure sessions and landing pages attributed to known AI referral sources in GA4; use when an agent needs bounded analytics evidence without equating missing referrers with zero AI visibility.
---

# AI referrals

Use this report to see which known AI referral domains appeared as GA4 session sources, which landing pages received those sessions, and how activity changed by day. It is useful for observed referral analysis, not for measuring every mention or citation. Referrers can be stripped, reclassified, or recorded as direct or unassigned traffic, so an empty result is not proof that no AI system sent or cited the site.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"ai-search"}`.
2. Call `seo_describe_report` with `{"id":"ai-referrals"}` and inspect the current schema.
3. Call `seo_run_report` with `{"id":"ai-referrals","params":{"property":"123456789","startDate":"28daysAgo","endDate":"yesterday","limit":25}}`.

The CLI uses the same registry and handler:

```sh
seo reports describe ai-referrals --json
seo reports run ai-referrals --params '{"property":"123456789","startDate":"28daysAgo","endDate":"yesterday","resultLimit":25}' --json
```

`property` is required. Dates accept `YYYY-MM-DD` or GA4 relative dates such as `28daysAgo`. `maxRows` bounds retained provider rows. `resultLimit` controls how many of the highest-session landing pages are returned (25 by default); use it to ask for a smaller or larger ranked review set. `limit` is a legacy alias for `maxRows`, so do not use it in new commands.

## Interpret and act

Start with `dataStatus`, `range`, `methodology`, and `dataSource.partialReasons`. Check `possiblyTruncated`, query-level statuses, warnings, returned rows, and the GA4 time zone before comparing totals. `summary.sessions` and `summary.eventCount` are additive; `summary.totalUsers` can be unavailable and must not be reconstructed by adding per-source or per-page values. Check `selection.landingPages` before treating `landingPages` as the whole retained breakdown: it states the output limit and any lower-ranked rows omitted from the response. Use `sources[].observedSessionSources` to preserve the exact attribution evidence, `shareOfAiSessions` only within detected AI sessions, and the returned `landingPages` to choose pages for a qualitative review.

Safe actions include checking whether high-volume landing pages answer the referring context, comparing complete like-for-like periods, and annotating material changes. Do not claim that referral sessions caused conversions, represent all AI traffic, or reveal the prompt, answer, citation, or user intent that produced the visit.
