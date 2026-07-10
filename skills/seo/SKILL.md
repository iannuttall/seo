---
name: seo
description: Use the local SEO CLI and MCP server to run deterministic technical SEO, Search Console, GA4, crawl, opportunity, monitoring, and reporting workflows. Use when an agent needs to diagnose a site, inspect report evidence, choose an SEO tool, or turn measured findings into next actions.
---

# seo

Use the `seo` MCP server exposed by the repository or installed package.

## When to call which tool

- Use `seo_doctor` first when setup/auth might be broken.
- Use `seo_clients` to discover saved client profiles before asking for a raw GSC property.
- Use `seo_client` to show, save, default, or delete a client profile.
- Use `seo_diagnose_property` when the user asks "what is going on?" for a property.
- Use `seo_report_narrative` when the user wants a client-ready "what changed, why, what next" writeup.
- Use `seo_monthly_report` when the user wants a monthly client or stakeholder report.
- Use `seo_workflow_diagnose_property` when the user wants the whole diagnosis process run end-to-end.
- Use `seo_workflow_monthly_report` when the user wants monthly reporting plus explicit next actions.
- Use `seo_workflow_update_postmortem` after a suspected or confirmed Google update.
- Use `seo_workflow_technical_watch` for scheduled crawl/index monitoring.
- Use `seo_workflow_refresh_priorities` to turn all opportunity signals into a ranked work queue.
- Use `seo_segment_impact` to explain which pages, queries, devices, or countries drove movement.
- Use `seo_striking_distance` for position 11-20 opportunities with real impressions.
- Use `seo_content_groups` to create reusable page/query sets for tests and reports.
- Use `seo_change_log` to record annotations for site, page, query, or group changes.
- Use `seo_measure_change` to measure before/after impact of a saved or ad hoc change.
- Use `seo_crawl_diff` to detect changed titles/meta/canonicals/status/indexability between crawls.
- Use `seo_index_watch` to separate current URL Inspection reviews, regressions, recoveries, failed checks, and quota-deferred work. Treat the result as Google's indexed snapshot, not a live test.
- Use `seo_audit_page` for one URL.
- Use `seo_second_page` when the user wants opportunities with evidence.
- Use `seo_quick_wins` for high-impression pages already ranking 4-10.
- Use `seo_cannibal` to find multi-URL query exposure candidates that need intent and technical review.
- Use `seo_decaying` to find query/page click declines observed in both retained GSC windows and the signals to investigate. Do not treat its signals as proven causes.
- Use `seo_pseo_audit` to find repeated URL template families and review retained page metrics, query patterns, bounded crawl samples, and exact URL Inspection verdicts.
- Use `seo_traffic_anomaly` when the user asks whether movement is statistically unusual.
- Use `seo_update_correlate` to compare a traffic movement with official Google update windows.
- Use `seo_internal_links` to find contextual internal-link candidates for one target URL.
- Use `seo_performance_audit` for one URL's Lighthouse lab diagnostics and device-specific CrUX field Core Web Vitals. Treat fallback fetch evidence as unscored and never call TBT field INP.
- Use `seo_ctr_underperformers` when the page ranks but click-through rate is weak.
- Use `seo_query_cluster` when the user wants explainable clustering with no embeddings.
- Use `gsc_query` only when the user explicitly wants raw Search Console rows.
- Use `gsc_url_inspect` when the user asks what Google sees for one URL.
- Use `ga4_run_report` for GA4 landing-page/session/event reports.
- Use `ga4_properties` to discover the signed-in user's GA4 property IDs.
- Use `search_updates` for official Google Search Status updates.
- Use `semrush_call` only when the user explicitly wants direct provider enrichment.

## Rules

- Treat observations as evidence within the report's methodology and data limits. Do not invent metrics.
- Check `dataStatus`, source completeness, selection counts, warnings, and caveats before summarising a report.
- In diagnosis output, check `summary.updateAttributionStatus` first and treat `summary.updateAttribution` as update-correlation context, not the site's overall diagnosis.
- If `dataStatus` is `partial` or `unavailable`, name the skipped or incomplete evidence before describing findings. Never turn an unavailable section into a zero-result claim.
- Treat quick-win CTR targets and calculated shortfalls as deterministic prioritisation heuristics, not traffic forecasts.
- Quote `principle` and `evidenceRef` when explaining recommendations.
- Do not generate titles, metas, or copy. Keep advice structural and diagnostic.
- If the tool returns no rows, say that clearly instead of padding the answer.
- Remember that grouped GSC query totals can undercount due to anonymised rows.

## Refresh behaviour

- Tool output is cached locally.
- Pass `refresh: true` when the user explicitly wants a fresh fetch.
