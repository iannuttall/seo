---
name: pseo-audit
description: Audit programmatic SEO template families with retained Google Search Console data, sitemap discovery, bounded page crawls, and exact URL Inspection evidence. Use when an agent needs to find repeated URL templates, compare their search visibility, check sampled index or crawl problems, or review whether generated pages have distinct intent and utility.
---

# pSEO audit

Call `seo_list_reports` with category `reporting` when discovery is needed.
Call `seo_describe_report` with id `pseo-audit`, then call `seo_run_report` with
that id and only the described parameters. Read `structuredContent` as the
machine contract. Use the CLI for CI, saved JSON, or environments without MCP.

```bash
seo reports describe pseo-audit --json
seo reports run pseo-audit --params '{"site":"sc-domain:example.com","detail":"summary"}' --json

seo pseo audit --project <project> --json
```

The catalog command is the portable agent path and rejects parameters outside
the MCP schema. The focused pSEO command adds human-readable flags and project
selection while calling the same implementation.

Pass `--site sc-domain:example.com` instead of `--project` when no project profile exists.

## Run the audit in two passes

Start with discovery and retained Search Console evidence. Keep MCP output compact.

```json
{
  "site": "sc-domain:example.com",
  "detail": "summary"
}
```

Add sitemap URLs when Search Console may not expose the full template population.

```bash
seo pseo audit \
  --project example \
  --sitemap https://example.com/sitemap.xml \
  --json
```

Rerun important templates with bounded technical samples. Three crawl and three URL Inspection samples are a sensible starting point. The maximum is 10 per template.

```json
{
  "site": "sc-domain:example.com",
  "crawlSamples": 3,
  "inspectSamples": 3,
  "detail": "full"
}
```

URL Inspection uses property quota. Only request it when index evidence changes the decision.

## Read the evidence in this order

1. Check `dataStatus`, `source`, `selection`, `warnings`, and `caveats`.
2. Use `population` to separate discovered, GSC-visible, sampled, and untested URLs.
3. Read the template `verdict`, then confirm it against `crawl`, `inspection`, and `evidence`.
4. Use `metrics.topQueries`, `queryPatterns`, and sample-level fields for the proposed action.

The report applies the output limit after ranking eligible templates by retained page impressions, clicks, URL count, and a stable signature tie-break.

## Keep claims inside the contract

- `PASS` is the only indexed URL Inspection verdict. `NEUTRAL` means excluded, `FAIL` means invalid, and every other value is unknown.
- `coverageState` is diagnostic text. Never parse it to decide whether a URL is indexed.
- URL Inspection describes Google's indexed snapshot for one URL. It does not prove that every URL in the template is healthy or currently appearing in search.
- Clicks, impressions, CTR, and position come from retained page-dimension Search Analytics rows. They are not guaranteed property totals.
- Query patterns and examples come from retained query/page rows. Anonymized and lower-ranked rows may be absent.
- Word count is descriptive. Do not recommend a minimum word count or call a page thin because it is short.
- Literal query-term coverage and path entity fit are review heuristics. They are not Google ranking factors or spam-policy verdicts.
- A sitemap URL with no GSC row does not prove zero demand. Performance may be omitted or credited to a canonical URL.

## Explain verdicts precisely

- `index-risk` means one or more sampled URLs returned exact excluded or invalid verdicts. State the sample count.
- `crawl-risk` means sampled URLs showed HTTP, robots, noindex, canonical, or fetch failures.
- `content-review` means at least three usable samples showed repeated metadata or weak literal term coverage. Ask for human review of originality, accuracy, and page-specific utility.
- `opportunity` means retained page rows triggered position, CTR, or entity-fit heuristics. Verify the query intent before changing templates.
- `healthy` requires at least two conclusive indexed samples and two usable crawl samples. It remains a sample finding.
- `inconclusive` means search evidence exists but technical sampling is too weak for a health verdict.
- `no-data` means no retained page evidence was found for the detected template. Do not turn that into a quality judgment.

## Useful controls

- `templateLimit`: 1 to 100 templates.
- `minimumTemplateUrls`: 2 to 100 repeated URLs. The default is 3.
- `minimumTemplateShare`: 0 to 1. The default is 0, so count controls discovery.
- `minimumTemplateImpressions`: retained page-impression threshold. The default is 0.
- `crawlSamples` and `inspectSamples`: 0 to 10 per template.
- `brandTerms`: explicit terms to exclude. Domain-derived terms are used when none are supplied.
- `refresh`: bypass supported local provider and HTTP caches.

For CSV files run:

```bash
seo export pseo --project <project> --out ./seo-exports/pseo
```
