---
name: performance-audit
description: Audit one URL with local Lighthouse lab data and optional CrUX field Core Web Vitals; use when an agent must separate reproducible diagnostics, real-user evidence, and fallback transport checks.
---

# Performance audit

Use this report to diagnose page performance with three deliberately separate evidence classes. Lighthouse provides one local lab run and actionable diagnostics. CrUX, when `SEO_CRUX_API_KEY` is configured and coverage exists, provides p75 field Core Web Vitals for a device and URL or origin scope. If Lighthouse cannot run, the report falls back to unscored HTTP transport evidence so the failure remains useful without pretending it measured page experience.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"ai-search"}`.
2. Call `seo_describe_report` with `{"id":"performance-audit"}`.
3. Call `seo_run_report` with `{"id":"performance-audit","params":{"url":"https://example.com/","strategy":"mobile","refresh":true}}`.

The CLI invokes the same report:

```sh
seo reports describe performance-audit --json
seo reports run performance-audit --params '{"url":"https://example.com/","strategy":"mobile","refresh":true}' --json
```

`url` is required; `strategy` is `mobile` or `desktop`. Omit `refresh` to allow the 24-hour local cache.

## Interpret and act

Start with `dataStatus`, `source`, `labDataStatus`, and `fieldDataStatus`. A Lighthouse `score`, `grade`, lab metrics, and `labInsights` describe that test environment and run. CrUX `fieldData.metrics` describes aggregated real-user p75 values; preserve `scope`, `formFactor`, `collectionPeriod`, missing metrics, and assessment. Origin-level data is not page-level evidence. If `source` is `fetch-fallback`, `fallbackFetchDuration` is the complete local fetch workflow, not TTFB, Lighthouse, LCP, CLS, TBT, or INP, and it never earns a score.

Use `topActions` as hypotheses tied to its evidence, then reproduce the relevant lab issue and verify after a change. Prioritise field failures with adequate coverage, recurring lab bottlenecks, and explicit savings evidence. Do not combine lab and field values into a new score, compare mobile with desktop as equivalent populations, or claim a ranking outcome from a passing or failing audit.
