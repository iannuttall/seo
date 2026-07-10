---
name: seo-geo-readiness
description: Audit local technical eligibility evidence and supporting website observations for AI search with seo. Use when the user asks about ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews, LLM citations, llms.txt, structured data, authorship, or AI-search visibility.
---

# GEO readiness

This workflow measures technical readiness and referral evidence. It does not
prove that an AI product cites the site.

## Run the readiness report

Create a saved crawl, then analyze the same report:

```bash
seo crawl --project <project> --max-pages 500 --save --json
seo ai-readiness --project <project> --json
```

Through MCP, use `seo_run_report` with report id `ai-readiness`. Use report id
`geo-gaps` when exact affected URLs for crawl and indexability rules are
needed. Call `seo_describe_report` before a report when its parameters are not
already known.

1. Check `dataStatus`, `summary.pageLimitReached`, warnings, and caveats.
2. Separate failed technical checks from contextual observations.
3. Treat local crawl indexability as local evidence. It does not prove that
   Google indexed the URL.
4. Use bounded URL Inspection evidence when Google's indexed snapshot changes
   the decision. It is not a live crawl or a sitewide sample.

## Explain the evidence

- Blocked crawling, publisher `noindex`, snippet restrictions, and non-success
  HTML responses can prevent or limit technical eligibility.
- Structured data, semantic HTML, authorship, and dates are contextual
  observations. Recommend them only for a documented user or Search feature
  need.
- Paragraph shape, lists, tables, and question headings do not prove quality or
  citation likelihood.
- Do not recommend content chunking or a minimum word count solely for AI
  Search.
- `/llms.txt` is optional metadata for agents that support it. The report does
  not treat it as a Google Search ranking signal.

Useful follow-up reports remain structured for agents:

```bash
seo seo-to-ai-query --project <project> --json
seo ai-referrals --project <project> --json
seo llms audit --project <project> --json
```

`seo-to-ai-query` creates deterministic monitoring-prompt suggestions from
retained GSC wording. These are not observed AI queries. `ai-referrals` reports
known GA4 referral evidence and cannot measure citations without a referral.

Report `nosnippet`, `max-snippet:0`, positive `max-snippet` limits, and
unrestricted `max-snippet:-1` exactly. No detected page-level restriction does
not guarantee that Google will select or show the page.
