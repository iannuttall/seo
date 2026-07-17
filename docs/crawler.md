# Crawler

The crawler checks whether a site can be found, crawled, understood, and cited.

It is built for two jobs:

- A human wants a short list of fixes.
- An agent wants structured data with stable rule ids and evidence.

## Start with the sitemap health pass

```bash
seo crawl --sitemap-url https://example.com/sitemap.xml --health --format pretty
```

Use this first on a large or unfamiliar site. It reads the sitemap and checks
the listed URLs for HTTP status, redirects, robots decisions, network failures,
and access blocks. It does not parse or render page bodies, join provider data,
check external links, or write page and robots responses to the local cache.
It starts with one request at a time and increases concurrency only after clean
responses.

Run a full crawl second when a health result needs investigation, or when the
question needs metadata, canonicals, indexability, internal links, structured
data, page content, or rendered HTML:

```bash
seo crawl https://example.com --format pretty
```

Use a project profile for a full crawl when you have one:

```bash
seo crawl --project keep --max-pages 500
```

When the exact sitemap URL is unknown, `--health` checks same-origin sitemap
declarations in `robots.txt` and then falls back to `/sitemap.xml`. Passing
`--sitemap-url` is faster and removes that discovery ambiguity.

When `robots.txt` declares same-origin sitemap files, the crawler tries those
first. JSON records the sitemap sources and returned URL counts. If none return
URLs, it also tries `/sitemap.xml`.

Each `sitemapDiscovery.roots[].documents` entry records the HTTP status,
content type, compression, byte counts, XML root, and any warning for a fetched
sitemap. Gzip-compressed files work. A malformed document, a non-sitemap root,
an unsuitable response, or a file over the 50 MiB sitemap limit remains
explicitly partial or unavailable instead of being silently ignored.

When a sitemap redirects, that document keeps both the requested URL and the
final URL. The response status belongs to the final response. Treat a redirect
as evidence to inspect, not proof that the sitemap is broken.

`sitemapDiscovery.roots[].lastmods` records supplied `lastmod` values as
unverified metadata. It counts values that parse, and keeps small samples of
malformed or future dates so you can inspect the generating system. SEO never
uses them to order discovery or claim that a page changed. An index-level
`lastmod` describes the sitemap file, not every page it lists.

## External-link checks

External-link checks use a bounded sample spread across source pages. The JSON
report keeps each selected result on the page that linked to it and records
retained, selected, fetched, failed, and deferred URLs. A 404 is evidence that
the external target is unavailable. It does not mean the source page failed.

External-link checks run only during the full crawl, never during the health
pass.

## Crawler identity and access blocks

HTTP and browser requests use this stable, versioned User-Agent:

```text
SEO-Skill/<version> (+https://seoskill.dev)
```

Robots rules are evaluated against the `SEO-Skill` token. Structured output
keeps the exact identity in `access.crawler`. When a request returns an access
challenge, denial, or rate limit, `access.samples` preserves the URL, status,
provider indicators, request ID when available, and guidance.

Cloudflare Challenge Pages are identified from the response's
`cf-mitigated: challenge` header. Other Cloudflare headers show that the
response passed through Cloudflare, but do not prove Cloudflare caused an
ordinary 401, 403, or 429.
See Cloudflare's [Challenge response detection](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)
and [custom Skip rule](https://developers.cloudflare.com/waf/custom-rules/skip/)
documentation.

A User-Agent can be spoofed. Never create a broad User-Agent-only allow rule.
If the audit should have access, use a temporary exception limited to the audit
machine source IP, required hostname or paths, exact User-Agent, and only the
security rule that blocked the request. For Cloudflare, check Security Events
first and use the narrowest custom Skip rule. If no event matches, inspect the
origin security logs.

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

The rule registry has 51 rules. Each rule includes:

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

## GSC and Google Analytics joins

When you pass `--site`, the crawler joins Search Console page metrics.

```bash
seo crawl https://example.com --site sc-domain:example.com
```

When you pass `--google-analytics-property`, it joins Google Analytics landing-page metrics.

```bash
seo crawl https://example.com --google-analytics-property 123456789
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
seo crawl --sitemap-url https://example.com/sitemap.xml --health --format junit --output sitemap-health.xml
```

Pretty output is for humans. JSON is for agents and scripts. HTML is for sharing. Markdown creates tickets for prioritised fixes and keeps review observations in their own section.
JUnit creates one test case per sitemap document and listed URL with exact
status, redirect, network, robots, and access-block evidence for CI systems.

## CI gates

```bash
seo crawl --sitemap-url https://example.com/sitemap.xml --health --format junit --output sitemap-health.xml --fail-on high
```

Choose `--fail-on medium` or `--fail-on low` when the team has agreed to fail
on those findings. Follow a failed health URL with a focused page check or full
crawl; do not turn every deploy check into a full-site content audit.

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
