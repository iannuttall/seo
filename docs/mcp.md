# MCP and agents

The MCP server gives agents the same SEO tools as the CLI.

Use it when an agent needs to inspect a site, rank fixes, monitor a project, or pull structured data without copying huge reports into chat.

## Install into local clients

```bash
seo mcp install
```

Run it directly:

```bash
seo mcp serve
```

Test the server:

```bash
seo mcp serve --test
```

## Crawler tools

- `seo_crawl_site`
- `seo_audit_urls`
- `seo_top_fixes`
- `seo_affected_urls`
- `seo_geo_gaps`
- `seo_ai_readiness`
- `seo_entity_readiness`
- `seo_llms_txt_audit`
- `seo_llms_txt_generate`
- `seo_okf_build`
- `seo_okf_validate`
- `seo_explain_issue`
- `seo_list_rules`
- `seo_get_crawl_report`
- `seo_list_crawl_reports`
- `seo_compare_crawl_reports`

Crawler results are compact by default. Set `includePages` or `includeIssues` only when the agent really needs raw detail.

## SEO analysis tools

The MCP server also exposes tools for:

- main property diagnosis
- quick wins
- second-page opportunities
- decaying pages and queries
- cannibalisation
- CTR underperformers
- internal link opportunities
- query clustering
- content optimization reports
- local SEO test measurement with GSC, optional GA4, and optional controls
- page performance audits with Lighthouse or local fallback
- pSEO audits
- crawl diffs
- index monitoring
- link recovery
- update postmortems
- monthly reports
- AI referrals
- SEO query to AI prompt conversion

## Good agent workflow

1. Run `seo_crawl_site` with `saveReport: true`.
2. Read `summary`, `topFixes`, `warnings`, and `caveats`.
3. Use `seo_explain_issue` for unfamiliar rule ids.
4. Use `seo_affected_urls` to get exact URLs for one fix.
5. Use `seo_ai_readiness`, `seo_entity_readiness`, and `seo_geo_gaps` when the user asks about AI-search readiness.
6. Use `seo_llms_txt_generate` or `seo_okf_build` when the user asks for agent-readable site knowledge.
7. Use `seo_compare_crawl_reports` after a deploy when the user asks what changed.
8. Use `seo_content_optimization` when the user asks how to improve one URL.
9. Use `seo_measure_change` when the user has a dated SEO change and wants before/after impact.
10. Use saved report ids for follow-up questions.

This keeps the agent focused. It also avoids re-crawling when the user asks a second question.

## Claude plugin status

This repo now includes plugin metadata and standalone skills under `.claude-plugin` and `skills`.

The plugin is not published to a marketplace yet. The standalone skills ship inside the `seo` npm package and remain available directly from this repository.
