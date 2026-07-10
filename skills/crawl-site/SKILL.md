---
name: crawl-site
description: Build a bounded technical SEO inventory with explicit request, page, issue, and completeness evidence. Use for a site baseline or to save a stable crawl for focused follow-up reports.
---

# Crawl a site

A crawl observes what the configured fetcher could discover and retrieve during one run. It is the foundation for most technical reports, but it is not an index, traffic source, or guarantee of complete site coverage. Set a deliberate page and depth budget, then save the snapshot when later analysis must share the same evidence.

## Run it

For MCP, call `seo_list_reports` with category `crawl` when discovery is needed. Call `seo_describe_report` with `{ "id": "crawl-site" }`, then `seo_run_report` with:

```json
{
  "id": "crawl-site",
  "params": {
    "url": "https://example.com/",
    "maxPages": 100,
    "maxDepth": 3,
    "saveReport": true
  }
}
```

Check `isError` and consume MCP `structuredContent`. The same run is available from the CLI:

```sh
seo reports describe crawl-site --json
seo reports run crawl-site --params '{"url":"https://example.com/","maxPages":100,"maxDepth":3,"saveReport":true}' --json
```

Describe the schema before adding `include`, `exclude`, sitemap, robots, JavaScript, or fetch-rate controls; their interaction changes the evidence collected.

## Judge the crawl before the site

Start with status, `requestEvidenceStatus`, attempted and fetched counts, failures, retained pages, `pageLimitReached`, data-source states, warnings, and caveats. A partial or capped crawl cannot support an all-clear or a definitive zero. Raw `pages`, `requests`, and full `issues` are opt-in because they can be large; request only what the next decision needs.

Separate observations from defects. Response failures and contradictory indexability signals deserve investigation, while canonicals, robots rules, `noindex`, and snippet limits may be intentional. Use the compact top fixes for triage, then run `affected-urls` and `explain-issue` before creating work. Preserve the report id and crawl settings for verification. If JavaScript rendering was disabled or discovery depended on the sitemap or internal links, state that boundary when summarizing results.
