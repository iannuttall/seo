---
name: index-coverage
description: Compare a saved crawl and sitemap with Google Search Console page results, then choose representative URLs for URL Inspection. Use when an agent needs to investigate index coverage or decide where limited URL Inspection checks will answer the most useful questions without treating a missing Search Analytics row as proof that a page is unindexed.
---

# Investigate index coverage signals

Use `index-coverage` when the question is "which pages should I inspect?" A
site can expose a page through links, a crawl, or a sitemap while Search
Console returns no page row for the chosen period. That mismatch deserves
review. It does not prove that the page is unindexed.

The report compares three different kinds of evidence:

- A saved crawl shows which pages the local crawler fetched and which current
  controls it observed.
- Sitemaps show URLs submitted as discovery hints. They do not prove crawling
  or indexing.
- Search Analytics page rows show Google Search visibility returned during an
  exact finalized date range. They are not a complete index inventory.

Use URL Inspection after this report when you need Google's current indexed
verdict for a representative URL.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"monitoring"}`. Call
`seo_describe_report` with `{"id":"index-coverage"}`, then call
`seo_run_report`, for example:

```json
{"id":"index-coverage","params":{"site":"sc-domain:example.com","sitemaps":["https://example.com/sitemap.xml"],"days":90,"rowLimit":100000}}
```

The report uses the latest saved crawl for `site` unless `crawlReportId` names
one explicitly. Run `site-crawl` first when no suitable local crawl exists.
Pass `sitemaps` when the crawl did not capture useful robots.txt sitemap
declarations or when you need a specific sitemap scope.

The CLI uses the same schema and report logic:

```sh
seo reports describe index-coverage --json
seo reports run index-coverage --params '{"site":"sc-domain:example.com","sitemaps":["https://example.com/sitemap.xml"],"days":90,"rowLimit":100000}' --json
```

## Read the evidence before the URL lists

Start with `sources`. Check `completeness`, `rowLimit`, `rowLimitReached`,
invalid URLs, duplicate URLs, the Search Console date range, and invalid
metric rows. A partial or truncated source makes absence comparisons less
reliable.

Then inspect these groups:

- `retainedSearchVisibility` contains pages with Search Analytics
  impressions in the selected period.
- `crawlableWithoutRetainedSearchVisibility` contains fetched crawlable pages
  with no returned Search Console row. Treat these as review candidates.
- `blockedOrNonIndexable` keeps current crawl controls and historical search
  visibility separate. A control can be intentional.
- `sitemapOnly` and `searchConsoleOnly` show mismatches in the available source
  inventories. Scope, redirects, URL variants, and source limits may explain
  them.
- `templateReview` groups repeated URL shapes for sampling. A cluster is not a
  content-quality, duplication, or index-bloat verdict.

Every detail list is limited. Use `count`, `returned`, and `omitted` together
before describing the size of a group.

## Choose useful follow-up checks

Pick representative URLs from important templates, high-value site sections,
and unexpected sitemap-only groups. Prefer a small sample that tests different
failure theories over a long random list.

Run `index-watch` for those URLs to collect exact URL Inspection evidence. Use
`index-coverage-plan` when the inventory is too large for the available daily
quota. Fix crawl or sitemap scope problems before drawing conclusions from
cross-source mismatches.

Never call a URL indexed because it had Search Analytics visibility during the
period. Never call it unindexed because no row appeared. Do not turn a limited
or incomplete source into a whole-site index coverage percentage.
