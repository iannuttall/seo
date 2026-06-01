# seo

Use this skill when the repo or installed package exposes the `seo` MCP server.

## When to call which tool

- Use `seo_doctor` first when setup/auth might be broken.
- Use `seo_diagnose_property` when the user asks "what is going on?" for a property.
- Use `seo_segment_impact` to explain which pages, queries, devices, or countries drove movement.
- Use `seo_striking_distance` for position 11-20 opportunities with real impressions.
- Use `seo_audit_page` for one URL.
- Use `seo_second_page` when the user wants opportunities with evidence.
- Use `seo_quick_wins` for high-impression pages already ranking 4–10.
- Use `seo_cannibal` when the user suspects multiple URLs are competing for the same query.
- Use `seo_decaying` when the user asks what dropped and why.
- Use `seo_traffic_anomaly` when the user asks whether movement is statistically unusual.
- Use `seo_update_correlate` to compare a traffic movement with official Google update windows.
- Use `seo_internal_links` to find contextual internal-link candidates for one target URL.
- Use `seo_ctr_underperformers` when the page ranks but click-through rate is weak.
- Use `seo_query_cluster` when the user wants explainable clustering with no embeddings.
- Use `gsc_query` only when the user explicitly wants raw Search Console rows.
- Use `gsc_url_inspect` when the user asks what Google sees for one URL.
- Use `ga4_run_report` for GA4 landing-page/session/event reports.
- Use `ga4_properties` to discover the signed-in user's GA4 property IDs.
- Use `search_updates` for official Google Search Status updates.
- Use `semrush_call` only when the user explicitly wants direct provider enrichment.

## Rules

- Treat the tool output as authoritative. Do not invent metrics.
- Quote `principle` and `evidenceRef` when explaining recommendations.
- Do not generate titles, metas, or copy. Keep advice structural and diagnostic.
- If the tool returns no rows, say that clearly instead of padding the answer.
- Remember that grouped GSC query totals can undercount due to anonymised rows.

## Refresh behaviour

- Tool output is cached locally.
- Pass `refresh: true` when the user explicitly wants a fresh fetch.
