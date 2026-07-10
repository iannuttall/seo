---
name: performance
description: Audit and interpret one URL's Lighthouse lab performance and device-specific CrUX field Core Web Vitals with the local seo CLI or MCP server. Use when an agent needs to investigate LCP, INP, CLS, TBT, page-speed diagnostics, mobile-versus-desktop evidence, or performance remediation without confusing lab, field, and fallback measurements.
---

# Performance

Use `seo_performance_audit` for structured agent output. Pass `url`, choose
`strategy` as `mobile` or `desktop`, and use `refresh: true` only when a fresh
measurement is required.

CLI equivalents:

```bash
seo perf audit --url https://example.com/page --json
seo perf audit --url https://example.com/page --strategy desktop --refresh --json
```

Set `SEO_CRUX_API_KEY` to request Chrome UX Report field data. The packaged
Lighthouse runtime needs a compatible local Chrome installation.

## Interpret the report

1. Check `dataStatus`, `labDataStatus`, `fieldDataStatus`, and `caveats` first.
2. Treat CrUX as rolling, device-specific field evidence. Check whether its
   `scope` is the exact URL or the origin and quote the `collectionPeriod`.
3. Treat Lighthouse as one controlled navigation lab run. Use its compact
   `labInsights` and metric evidence for diagnosis, not as field experience.
4. Treat Lighthouse TBT as a lab responsiveness diagnostic. Never rename it
   INP. Field INP comes from CrUX.
5. Use the field p75 thresholds encoded by the report: LCP good at 2,500ms or
   less, INP good at 200ms or less, and CLS good at 0.1 or less. All three must
   be available and good for the field assessment to be good.
6. Prefer field findings when field and lab disagree. Explain that their
   populations and measurement conditions differ.
7. Keep recommendations tied to returned metrics or insights. Do not infer
   sitewide performance from one URL, device, or run.

## Guardrails

- `source: fetch-fallback` is unscored transport evidence. Its duration is the
  complete local fetch workflow, not TTFB, Lighthouse, or Core Web Vitals.
- Stop performance conclusions when fallback evidence is blocked or non-2xx.
- `unavailable_no_coverage` means CrUX lacks enough data; it does not mean the
  page passed or failed Core Web Vitals.
- `request_failed` is an operational provider problem, not a page finding.
- Missing field metrics make the Core Web Vitals assessment incomplete.
- Do not request or paste raw Lighthouse output unless a human explicitly
  needs the underlying artifact; compact output is the stable agent contract.
