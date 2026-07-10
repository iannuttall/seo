---
name: monthly-report
description: Generate a calendar-month SEO narrative from finalized first-party evidence. Use it to brief humans while preserving source status, caveats, and measured next actions.
---

# Monthly report

Monthly reporting matters because it fixes the analysis to a named calendar
period and turns several measurements into one reviewable brief. The report can
show observed movement and prioritized investigations. It cannot establish why
traffic changed, guarantee that a recommended edit will help, or forecast
clicks, rankings, revenue, or future performance.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "reporting"` and select `monthly-report`.
2. Call `seo_describe_report` with `id: "monthly-report"` and inspect the current schema.
3. Call `seo_run_report` with `id: "monthly-report"` and only described parameters.

The CLI exposes the same report:

```sh
seo reports describe monthly-report --json
seo reports run monthly-report --params '{"site":"sc-domain:example.com","month":"2026-05","limit":10,"includeBrand":false,"verifyContent":true,"verifyLimit":5}' --json
```

Use `YYYY-MM` for `month`. `limit` bounds retained findings, not provider row
retrieval. `verifyContent` fetches a bounded subset, so `verifyLimit` must not
be interpreted as full-site validation.

## Interpret and act

Confirm `month`, the underlying date windows, `dataStatus`, source completeness,
skipped sections, warnings, and caveats before reading the headline. Treat the
narrative as a rendering of structured evidence. Follow its references into
the diagnosis, measured changes, priorities, and monitoring results when a
claim needs verification. A zero from a complete source differs from an
unavailable, partial, filtered, or capped section.

Safe actions start with the highest-evidence priorities: validate affected URLs,
compare relevant templates, inspect confirmed technical regressions, and assign
owners to bounded tests. Keep brand filtering and content-verification status
visible. Record what changed so the next month can measure it. Do not rewrite a
page merely because it appears in a heuristic opportunity list, and do not
present update overlap or timing as causation.

Read MCP `structuredContent` as the machine contract. Use returned Markdown for
the human brief, but never parse it to recover data already present in JSON.
