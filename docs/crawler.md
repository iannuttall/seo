# Crawler

The crawler checks whether a site can be found, crawled, understood, and cited.

It is built for two jobs:

- A human wants a short list of fixes.
- An agent wants structured data with stable rule ids and evidence.

## Basic crawl

```bash
seo crawl https://example.com --format pretty
```

Use a project profile when you have one:

```bash
seo crawl --project keep --max-pages 500
```

## What it captures

For each page, the crawler records:

- request URL, final URL, status, redirects, headers, response time, and content type
- title, meta description, canonical, robots directives, H1/H2/H3, language, viewport, and word count
- internal links, external links, inlinks, depth, and internal link authority
- images, missing alt text, Open Graph, Twitter card, schema types, hreflang, mixed content, compression, HTTPS, and HSTS
- optional page-structure observations such as semantic HTML, structured data, author, date, question headings, paragraph shape, lists, tables, and FAQ schema; paragraph shape is not scored as an SEO or citation factor
- optional `/llms.txt` presence as unscored agent metadata, not a Google Search factor
- AI discovery signals such as per-bot robots.txt access, sitemap declarations, agent resource files, schema sameAs, and official social profile links

## Rules

The rule registry has 50 rules. Each rule includes:

- stable id
- category
- default severity
- why it matters
- how to fix it
- impact if ignored
- how to verify it
- evidence fields for agents where useful

List rules:

```bash
seo rules
seo explain --rule missing_meta_description
```

## GSC and GA4 joins

When you pass `--site`, the crawler joins Search Console page metrics.

```bash
seo crawl https://example.com --site sc-domain:example.com
```

When you pass `--ga4-property`, it joins GA4 landing-page metrics.

```bash
seo crawl https://example.com --ga4-property 123456789
```

Project profiles can save both, so the command stays short:

```bash
seo crawl --project keep
```

GSC joins use cached bulk Search Analytics queries. They do not make one GSC request per URL. Repeated runs reuse cached query results until they go stale.

## Output formats

```bash
seo crawl https://example.com --format pretty
seo crawl https://example.com --format json
seo crawl https://example.com --format csv --csv issues
seo crawl https://example.com --format csv --csv pages
seo crawl https://example.com --format html --output report.html
seo crawl https://example.com --format markdown --output tickets.md
```

Pretty output is for humans. JSON is for agents and scripts. HTML is for sharing. Markdown creates tickets for prioritised fixes and keeps review observations in their own section.

## CI gates

```bash
seo crawl https://example.com --fail-on high
```

Use `--fail-on medium` when you want stricter gates before launch.

## Saved reports

```bash
seo crawl --project keep --save
seo crawl-reports
seo crawl-reports --id <report-id>
seo crawl-reports --compare latest --against previous
```

Saved reports are useful because agents can ask for prioritised fixes, review observations, affected URLs, and AI Search eligibility blockers without re-crawling. Review observations keep optional metadata, hardening headers, and one slow response visible without presenting them as proven implementation work.

Comparisons are useful after deploys. They show which pages were added, removed, fixed, or changed, and which rules got better or worse. Agents get the same diff as structured JSON, including changed fields and issue counts by rule id.

They also power the AI readiness and knowledge export commands:

```bash
seo ai-readiness --project keep
seo entity-readiness --project keep
seo llms generate --project keep --output llms.txt
seo okf export --project keep --output ./okf
```
