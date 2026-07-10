---
name: seo-geo-readiness
description: Audit technical eligibility and supporting website observations for generative search with seo. Use when the user asks about ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews, LLM citations, llms.txt, structured data, authorship, or AI-search visibility.
---

# GEO readiness

Use `seo` to check crawl and Search eligibility evidence, then report optional page and agent-protocol observations separately.

This skill measures readiness. It does not prove that ChatGPT, Claude, Perplexity, Gemini, or Google AI Overviews currently cite the site.

## Workflow

1. Run or load a crawl.

```bash
seo crawl --project <project> --max-pages 500 --save --json
```

2. Pull GEO gaps.

With MCP, use `seo_geo_gaps`.

With CLI, inspect the saved crawl report or run:

```bash
seo crawl --project <project> --severity medium --json
```

3. Explain the main GEO rule ids:

- `geo_no_structured_data`
- `geo_no_author`
- `geo_no_date`
- `geo_no_semantic_html`

4. Turn the gaps into a fix plan.

## How to explain GEO findings

Use plain words:

- Structured data helps machines understand entities, page type, facts, and authorship.
- Semantic HTML helps agents separate main content from navigation and boilerplate.
- Authorship and dates help with trust and freshness.
- Paragraph shape, lists, tables, and question headings are observations, not proof of quality or citation likelihood.
- Do not recommend content chunking or a minimum word count solely for AI Search.
- `/llms.txt` is optional metadata for agents that explicitly support it. Google says it has no positive or negative Search impact.

## Useful follow-up commands

```bash
seo seo-to-ai-query --project <project>
seo ai-referrals --project <project>
seo llms audit --project <project>
```

`seo-to-ai-query` turns retained GSC query wording into deterministic monitoring-prompt suggestions. These prompts are not observed AI demand. `ai-referrals` checks GA4 for known AI referral sources.

## Caveat to include

If the user asks whether they appear in AI answers, say the truth: this tool checks readiness and referral evidence. It does not yet run scheduled prompts across AI engines or track citations.
