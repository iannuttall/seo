---
name: audit-page
description: Audit one fetched URL for technical and on-page evidence. Use it to inspect a specific page without turning page-level observations into sitewide claims.
---

# Audit page

Use this report when a URL needs direct inspection: after a release, while
investigating a search result, or before recommending a page edit. It combines
the fetched document with metadata, headings, links, structured data, and
optional GSC evidence. It does not prove how every crawler rendered the page,
that Google indexed the fetched version, or that an observed convention affects
rankings.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "reporting"` and select `audit-page`.
2. Call `seo_describe_report` with `id: "audit-page"`; do not guess fields.
3. Call `seo_run_report` with `id: "audit-page"` and parameters matching that schema.

The CLI has the same contract:

```sh
seo reports describe audit-page --json
seo reports run audit-page --params '{"url":"https://example.com/product","site":"sc-domain:example.com","refresh":true}' --json
```

`url` is required. `site` adds Search Console context when access exists.
Enable `js` only when client rendering is necessary; omitted rendering behavior
is selected by the report. `refresh` bypasses reusable cached evidence.

## Interpret and act

Start with `fetchDiagnostics`, warnings, and the final fetched URL. A redirect,
blocked response, rendering failure, or non-HTML response limits every later
observation. Then inspect the observed page fields, structured-data findings,
issues, and recommendations. Title pixel width is an estimator for review, not
a Google limit. Heading counts describe document structure; more or fewer than
one H1 is not automatically a defect. Content length is evidence, not a quality
score. If GSC metrics are present, keep their window and property semantics
attached.

Safe actions are concrete and reversible: repair a broken canonical, make
important content available in the fetched HTML, correct invalid structured
data, or investigate a failed response. Verify intent before changing
`noindex`, canonicals, robots controls, headings, or snippet directives. One
page cannot support a sitewide conclusion. Read MCP `structuredContent` as the
machine contract and use Markdown only for the human explanation.
