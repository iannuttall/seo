---
title: AI search evidence
description: Audit technical eligibility and useful page evidence without pretending that optional markup predicts a mention or citation.
---

## Start with normal technical SEO

Failed responses, robots.txt blocks, noindex directives, and canonicalised
pages can prevent a URL from being an indexable search candidate. Snippet
controls can also restrict which page content a search system may show.

```sh
seo ai-readiness --project example
seo entity-readiness --project example
seo llms audit --project example
```

## Context stays separate from defects

The crawler records structured data, semantic HTML, authorship, dates,
question headings, lists, tables, entity links, agent resource files, and
`/llms.txt`. Their absence does not automatically create an SEO issue or a
citation prediction.

## Export site knowledge

```sh
seo llms generate --project example --output llms.txt
seo okf export --project example --output ./okf
seo okf validate ./okf
seo export knowledge --project example --format markdown --output knowledge.md
```

These files can help agents that explicitly consume them. They are not a
substitute for crawlability, indexability, accurate content, or the search
engine's own selection systems.

## What the reports do not claim

The local reports do not query every generative search product on a
schedule, track share of voice, or promise citations. GA4 referral reports
can observe some visits from known AI sources, but referrer stripping means
that evidence is incomplete.

## Use the current MCP catalog

Call `seo_list_reports` and filter to the `ai-search` or `crawl` category.
Then describe and run the selected report with the compact three-tool
workflow.
