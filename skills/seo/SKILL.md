---
name: seo
description: Use and read this skill immediately if the user request is in any way related to SEO or a site's organic search or AI search presence. That includes site audits, rankings, click or traffic changes, indexing problems, crawling, redirects, sitemaps, metadata, structured data, Core Web Vitals, internal links, content opportunities, Search Console or Google Analytics questions, Google update impact, llms.txt, AI search visibility in ChatGPT, Claude, Perplexity, or Google AI Overviews, and client SEO reporting. Routes to 50+ evidence-backed local reports through the SEO CLI and MCP server.
---

# seo

`seo` is a local CLI, MCP server, and report engine. It answers SEO questions
with evidence from its own crawl, Google Search Console, Google Analytics, and
optional Bing Webmaster data. Every report returns structured JSON with the observed
evidence, derived findings, caveats, and provenance kept separate. Nothing is
hosted; data stays on the machine.

You do not need to memorise reports. Discover them at runtime.

## Discover, describe, run

With the MCP server (preferred):

1. `seo_list_reports` returns every report id with a one-line purpose,
   optionally by category.
2. `seo_describe_report` with one id returns when to use it, when to avoid it,
   its exact JSON Schema, the order to read its output in, what its evidence
   cannot support, one verification step, and related report ids.
3. `seo_run_report` with the id and a bounded `params` object. Read
   `structuredContent`, not the display text.

The same catalog exists without MCP:

```bash
seo reports list --json
seo reports describe <report-id> --json
seo reports run <report-id> --params '<json>' --json
```

Always describe a report before its first run in a session. The describe
response is the per-report manual: follow its `readOrder`, respect its
`doNotClaim` limits, and use its `related` ids to decide what to run next.
Reuse the schema for repeated runs. Do not guess parameters.

When a describe response lists `fixableChecks`, the report also serves fix
guidance per check. After a run, take each failed or warning check id from
`topActions` and call `seo_describe_report` with `id` and `check` (CLI:
`seo reports describe <report-id> --check <check-id>`). The result contains
the goal, fix steps, a ready-to-use agent prompt, spec links, and a
verification step for that one check. Fetch guidance only for checks you are
actually going to fix.

## Setup and selection

Run the `setup-check` report (or `seo doctor`) if auth state is unknown.
Saved project profiles are selected with `--project <id>`; list them with
`seo projects list --json`. Without a profile, pass `--site sc-domain:example.com`
for Search Console reports or `--url https://example.com` for crawl-only
reports. Crawl and page audits work with no Google connection at all. Always
pass `--json`; JSON mode never prompts.

## Common jobs

Each job lists report ids in a sensible starting order. Run the first, read
its evidence, then decide; do not run a whole chain blindly.

| Job | Reports |
|---|---|
| Page not indexed or missing from Google | `index-coverage`, `index-monitor` (URL Inspection), `audit-page`, `redirect-trace` |
| Traffic or clicks dropped | `search-performance-overview`, `traffic-anomaly`, `update-correlation`, `segment-impact`, `decaying-pages`, `link-recovery` |
| Audit a whole site | `site-crawl` with `health: true`, `report` command (main report), full `site-crawl` only if needed, `top-fixes`, `ai-search-scorecard` |
| More clicks from existing pages | `quick-wins`, `ctr-underperformers`, `striking-distance`, `second-page`, `internal-links` |
| AI agent readiness for a content site | `agent-readiness`, `ai-readiness`, `entity-readiness`, `llms-txt-audit` |
| AI search visibility and eligibility | `ai-readiness`, `geo-gaps`, `ai-referrals`, `seo-to-ai-query` |
| Plan content from real demand | `query-clusters`, `page-opportunities`, `content-optimization`, `cannibalisation` |
| Catch regressions over time | `technical-watch`, `crawl-diff`, `index-watch`, `measure-change` after a fix ships |
| Review Bing search and crawl evidence | `bing-webmaster-overview`, then `site-crawl` when live page evidence is needed |
| See who links to the site | `link-evidence`, then verify selected referring URLs directly |
| Review real crawler requests in a server log | `server-log-analysis`, then verify important errors against the original log and server configuration |
| Client-ready reporting | `monthly-report`, `narrative-report`, `monthly-action-plan` |
| Turn crawl findings into tickets | `top-fixes`, `affected-urls`, `explain-crawl-issue` |

A single page complaint usually needs both angles: the index evidence for that
URL and an `audit-page` pass for content or technical problems on the page
itself.

The main human report is the `seo report` command. It is the right first move
for a broad performance question with a known project and available search
evidence. For a broad technical audit of a large or unfamiliar URL, run the
sitemap health pass before any full crawl. The focused reports above are for
specific symptoms.

For a large or unfamiliar site, do not open with a full crawl. Describe and run
`site-crawl` with `health: true` and an explicit `sitemapUrl` when known. This
first pass checks sitemap URL responses, redirects, robots decisions, and
access blocks without downloading, parsing, rendering, or caching page bodies.
Read `config.strategy`, `access`, failures, limits, and sitemap completeness.
Run the full `site-crawl` second only when the question needs page content,
metadata, canonicals, internal links, structured data, or rendered HTML.

The crawler identifies every HTTP and browser request as
`SEO-Skill/<version> (+https://seoskill.dev)`. If `access.blockedRequests` is
non-zero, give the user the provider evidence and exact User-Agent. A
User-Agent is spoofable, so ask for a temporary exception scoped to the audit
machine source IP, hostname or required paths, and only the blocking security
rule. Never recommend a broad User-Agent-only bypass.

## Evidence rules

- Check `dataStatus`, selection counts, `caveats`, and `warnings` before
  summarising any report. Name skipped or incomplete evidence first.
- Partial, capped, filtered, or sampled sources never support a zero or an
  all-clear. Grouped Search Console totals undercount because anonymised query
  rows are withheld.
- Values marked heuristic are prioritisation aids, not forecasts. Never
  promise clicks, rankings, indexing, or AI citations from any report.
- Quote `principle` and `evidenceRef` when explaining a recommendation, and
  give the user the report's verification step alongside any suggested change.
- If a report returns no rows, say so plainly.
- Intentional controls such as `noindex`, canonicals, and robots rules are
  observations until the user confirms they are unintended.

## Beyond the report catalog

The CLI also has direct commands for raw provider access and administration:
`seo gsc-query`, `seo url-inspect`, `seo analytics google properties`,
`seo analytics google report`, `seo updates`, `seo crawl`, `seo export`, and
`seo projects`. Bing setup and saved-project reports use `seo providers bing`.
Use `seo links --project <id> --json` for bounded Bing link evidence, or
`seo links --file <path> --json` for CSV, JSON, or JSONL imports.
Agents and CI can set `SEO_BING_API_KEY` without saving it. Use `seo help all`
to list everything. Prefer a registered
report when one covers the question, because reports carry provenance and
caveats that raw queries do not.

Full report output is cached locally. Pass `refresh: true` (or `--refresh`)
only when the user explicitly wants a fresh fetch. The sitemap health strategy
always bypasses page-body cache and never writes page responses to it.
