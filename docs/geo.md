# GEO and AI search

GEO means making pages easier for AI answer engines to understand and cite.

The crawler does not guess whether a page will be cited. It checks whether the page has the signals that make citation more likely.

## What the crawler checks

The GEO rules look for:

- machine-readable structure through JSON-LD and schema
- semantic HTML such as `main`, `article`, and clean heading structure
- authorship and trust signals
- published or modified dates
- direct answers near clear headings
- question-style headings
- lists, tables, and other extractable blocks
- enough content depth to cite
- `/llms.txt`

Run:

```bash
seo crawl --project keep --severity medium
```

For a focused GEO slice, use MCP tool `seo_geo_gaps` after a saved crawl.

## What the AI-search helpers do

`seo seo-to-ai-query` turns GSC queries into prompts you can monitor manually or with a future AI visibility tracker.

```bash
seo seo-to-ai-query --project keep
```

Example output might turn a search query like `best payroll software for contractors` into prompts such as:

- What should someone know about payroll software for contractors?
- Which payroll software options are best and why?
- How do I choose the best payroll software for contractors?

`seo ai-referrals` scans GA4 for referral traffic from known AI sources.

```bash
seo ai-referrals --project keep
```

GA4 can miss AI visits when the referrer is stripped. Treat this as evidence, not the whole truth.

## What is not built yet

True AI visibility tracking is still future work.

That means we do not yet:

- ask ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews on a schedule
- record whether your brand was mentioned
- record which URLs were cited
- compare share of voice against competitors
- track prompt visibility over time

The current product helps you make pages ready for AI search. The next product layer should prove whether that readiness turns into mentions and citations.
