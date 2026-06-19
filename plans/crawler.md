# Enterprise Crawler Plan

Goal: build an enterprise-quality technical SEO and GEO crawler that feels simple for humans, stays structured and idempotent for agents, and can later power a hosted API without rewriting the core.

For now this stays local-first: CLI, MCP, local storage, local reports. Design the core APIs so a future hosted API can call the same crawler, rule engine, scoring, exports, and saved-report model.

## Product Principles

- [ ] Keep `seo report` as the main human entry point.
- [ ] Add a dedicated crawler surface without making root help noisy.
- [ ] Use plain English for humans: what happened, why it matters, what to do, how to verify.
- [ ] Use stable structured data for agents: ids, rule codes, evidence, affected URLs, severity, impact, confidence, and fix hints.
- [x] Make crawler operations idempotent: same input config should produce reusable report ids, deterministic cache keys, and safe repeat runs.
- [ ] Keep CLI and MCP thin; put crawler logic, rules, scoring, and persistence in `packages/core`.
- [ ] Treat crawl data as durable evidence that other reports can reuse, not disposable command output.
- [ ] Keep local-only assumptions out of core types where practical, so hosted API support is an adapter later.

## Phase 1: Shared Rule System

- [ ] Add a core `RuleInfo` registry for all technical, content, GEO, and data-backed rules.
- [ ] Give every rule a stable machine id, human title, category, default severity, and owner area.
- [ ] Store `whyItMatters`, `howToFix`, `impactIfIgnored`, and `howToVerify` for every rule.
- [ ] Add structured fix hints for agents, for example affected field, suggested command, and verification tool.
- [ ] Support issue instances that reference a rule id plus concrete evidence.
- [ ] Add `listRules()` and `explainRule(ruleId)` core functions.
- [ ] Expose rule explanations in CLI, MCP, JSON output, and later HTML reports.
- [ ] Add tests that fail when a new issue code has no rule guidance.

## Phase 2: Full Crawl Engine

- [ ] Add a first-class crawl config type in core.
- [ ] Support crawl modes: site crawl, single URL, explicit URL list, and sitemap-only crawl.
- [ ] Support `maxPages`, `maxDepth`, `concurrency`, `timeoutMs`, `include`, `exclude`, `respectRobots`, `useSitemap`, `checkExternal`, `js`.
- [ ] Seed from homepage and XML sitemaps.
- [ ] Parse nested sitemap indexes.
- [ ] Respect robots.txt by default.
- [ ] Capture robots-blocked URLs as skipped evidence, not fatal errors.
- [ ] Normalize URLs consistently: remove fragments, handle trailing slash policy, handle `www` only where intended.
- [ ] Avoid crawling common non-page assets as pages.
- [ ] Track discovered, queued, crawled, skipped, failed, and verified-link counts.
- [ ] Make cancellation safe and return partial reports with clear status.
- [ ] Reuse existing fetch/cache/rate-control code where possible.
- [ ] Keep JS rendering optional and bounded because it is expensive.

## Phase 3: Page Snapshot Model

- [ ] Expand page snapshots beyond current crawl-diff fields.
- [ ] Capture request URL, final URL, status, redirect chain, content type, response time, size, headers, and cache diagnostics.
- [ ] Capture title, meta description, canonical, meta robots, X-Robots-Tag, H1/H2/H3, word count, main content hash, and extracted text summary.
- [ ] Capture internal links, external links, inlink count, outgoing link count, anchor text samples, and crawl depth.
- [ ] Capture images total, missing alt count, social tags, JSON-LD schema types, hreflang, lang, viewport, mixed content, HSTS, compression, and HTTPS.
- [ ] Capture GEO signals: semantic HTML, structured data, author, date, question headings, answer-ready blocks, tables/lists, FAQ/QAPage schema, `llms.txt`.
- [ ] Capture indexability as a derived field with reason.
- [ ] Capture per-page SEO score and per-page GEO score.
- [ ] Preserve enough raw evidence for agents to propose exact fixes without re-fetching.

## Phase 4: Audit Rules

- [ ] Implement response rules: connection errors, 4xx, 5xx, redirects, redirect chains, slow responses.
- [ ] Implement link rules: broken internal links, broken external links, orphan pages, deep pages, weak internal links to valuable pages.
- [ ] Implement metadata rules: missing/short/long/duplicate titles and meta descriptions.
- [ ] Implement heading rules: missing H1, multiple H1s, weak heading structure.
- [ ] Implement indexability rules: noindex, nofollow, X-Robots noindex, robots blocked, canonicalized pages.
- [ ] Implement canonical rules: missing canonical, canonical mismatch, non-absolute canonical, canonical chain.
- [ ] Implement content rules: thin content, duplicate content, low text ratio, missing query coverage when GSC data exists.
- [ ] Implement image rules: missing alt text and oversized image candidates when detectable.
- [ ] Implement performance/security rules: large HTML, no compression, HTTP, mixed content, missing HSTS.
- [ ] Implement mobile/international rules: missing viewport, missing lang, hreflang issues.
- [ ] Implement social/schema rules: missing Open Graph, missing Twitter card, missing structured data, invalid JSON-LD parse.
- [ ] Implement GEO rules: no machine-readable structure, weak semantic HTML, missing author/date, not answer-ready, too thin to cite, missing `llms.txt`.
- [ ] Keep every issue tied to a rule id and concrete evidence.

## Phase 5: Scoring And Prioritisation

- [ ] Add site health score for technical SEO.
- [ ] Add site GEO readiness score.
- [ ] Add per-page SEO score.
- [ ] Add per-page GEO score.
- [ ] Add internal link authority score.
- [x] Rank top fixes by severity, affected count, page importance, GSC clicks/impressions, GA4 sessions when available, and effort.
- [x] Do not let generic notices outrank search-visible errors.
- [x] Add `topFixes(report, filters)` as a core function.
- [x] Add category filters, severity filters, URL filters, and project filters.
- [x] Make scoring explainable in JSON so agents can audit why something ranked high.

## Phase 6: Search Data Join

- [x] Join crawl issues to GSC page metrics when a site/property is available.
- [x] Mark issues on URLs with recent clicks, impressions, position, and CTR.
- [x] Join GA4 landing-page sessions/conversions when a property is available.
- [x] Make value-aware recommendations: broken high-click URLs beat cosmetic low-traffic notices.
- [x] Add a "technical fixes with search value" section to `seo report`.
- [ ] Add link recovery and redirect recommendations directly into crawl results where evidence exists.
- [ ] Keep crawl commands usable without Google auth.

## Phase 7: Local Report Store

- [ ] Add saved crawl reports to local storage.
- [ ] Store report metadata separately from full report payload.
- [x] Support `list`, `show`, `delete`, and `latest`.
- [x] Store config hash for idempotent reruns.
- [x] Add report ids that are stable enough for agents but do not leak secrets.
- [ ] Add report status: completed, partial, failed.
- [ ] Recompute derived scores on load so older reports can self-heal after scoring changes.
- [ ] Keep storage shape adaptable for future hosted persistence.

## Phase 8: CLI Surface

- [x] Add `seo crawl <url>` or `seo technical-audit <url>` after deciding the name.
- [ ] Add `seo audit-url <url>` only if it is clearer than extending `seo audit-page`.
- [x] Add URL-list mode from arguments and/or file input.
- [x] Add `--format pretty|json|csv|html`.
- [x] Add `--output <path>`.
- [ ] Add `--save`.
- [x] Add `--fail-on high|medium|low`.
- [x] Add `--severity high|medium|low`.
- [x] Add `--project` support when a saved project has a crawl URL.
- [ ] Make progress print to stderr so JSON stdout stays clean.
- [ ] Keep default human output short: summary, top fixes, next commands.
- [x] Add `seo rules` and `seo explain <rule>` or equivalent.

## Phase 9: MCP Surface

- [x] Add `seo_crawl_site`.
- [x] Add `seo_audit_urls`.
- [x] Add `seo_explain_issue`.
- [x] Add `seo_list_rules`.
- [x] Add `seo_top_fixes`.
- [x] Add `seo_affected_urls`.
- [x] Add `seo_geo_gaps`.
- [x] Add `seo_get_crawl_report`.
- [x] Add `seo_list_crawl_reports`.
- [x] Keep MCP crawl results compact by default.
- [x] Make full pages/issues opt-in.
- [x] Return pre-digested slices so agents do not need to aggregate huge payloads.
- [x] Make saved report tools operate without re-crawling.

## Phase 10: Human Reports

- [ ] Add crawl caveats to terminal, JSON, and narrative output.
- [x] Add a compact technical section to `seo report`.
- [x] Add plain-English issue groups with top affected URLs.
- [x] Add "how to verify" commands after top fixes.
- [x] Add shareable HTML export for crawl reports.
- [ ] Add CSV export for issues and pages.
- [x] Add markdown export for agent-created implementation tickets.
- [ ] Keep sparse data graceful: no auth should still produce a technical crawl; no crawl URL should skip the section clearly.

## Phase 11: Agent Workflow Improvements

- [ ] Add a workflow that runs crawl, joins GSC/GA4 when available, ranks fixes, and returns an implementation queue.
- [x] Add issue-specific affected URL slicing.
- [x] Add command follow-ups for every top fix.
- [x] Add verification recipes for common fixes.
- [ ] Add "rerun same report config" support.
- [ ] Add deterministic JSON schemas for crawl report, issue group, top fix, rule info, and page snapshot.
- [ ] Add MCP prompt/resource docs for crawler workflows.
- [ ] Add a bundled skill/plugin later once the local API is stable.

## Phase 12: Hosted-Ready Boundaries

- [ ] Keep crawl execution behind a core service function that accepts config and dependencies.
- [ ] Keep storage behind an adapter interface.
- [ ] Keep fetch/cache/rate controls injectable.
- [ ] Keep auth/data joins optional and provider-based.
- [ ] Make report payloads tenant-safe: no local paths, no tokens, no raw secrets.
- [ ] Add clear limits for future paid tiers: max pages, JS render count, schedules, report history, external link checks.
- [ ] Add queue-friendly crawl status events.
- [ ] Add resumable or partial crawl concepts only when local implementation needs them.
- [ ] Avoid hosted-only complexity until the local crawler is excellent.

## Phase 13: Quality Gates

- [ ] Add parser fixture tests for HTML extraction.
- [ ] Add audit rule tests for every rule family.
- [ ] Add crawler tests with local HTTP fixtures for redirects, robots, sitemap, broken links, and content types.
- [ ] Add JSON schema snapshot tests for CLI and MCP outputs.
- [ ] Add help sweep tests for new commands.
- [ ] Add idempotency tests for config hashing and report loading.
- [ ] Add large-site safety tests for limits, concurrency, cancellation, and skipped URLs.
- [ ] Add regression tests for sparse/missing GSC and GA4 joins.

## Open Decisions

- [ ] Choose command name: `seo crawl`, `seo technical-audit`, or both with one alias.
- [ ] Decide whether to merge `audit-page` into the crawler model or keep it as a narrow page-level command.
- [ ] Decide initial severity names: existing `low|medium|high` vs crawler-style `notice|warning|error`.
- [ ] Decide local report storage format: SQLite rows, JSON blobs, or hybrid.
- [ ] Decide whether HTML export belongs under `seo crawl --format html` or `seo export crawl`.
- [ ] Decide when to add desktop/web UI, if ever, versus focusing on CLI/MCP/API.

## First Implementation Slice

- [x] Add shared rule registry and rule coverage tests.
- [x] Expand `crawlOne` into richer page snapshots.
- [x] Add a new crawl report type in core.
- [x] Add site crawl with sitemap/robots/depth/page limits.
- [x] Implement the first 20 high-value rules.
- [x] Add compact CLI output and JSON output.
- [x] Add MCP `seo_crawl_site`, `seo_top_fixes`, and `seo_explain_issue`.
- [x] Join GSC page metrics when `--site` or `--project` is provided.
- [x] Add saved local reports with `latest`.
- [x] Wire `seo report` to recommend the crawler when no technical baseline exists.
