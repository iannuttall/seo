---
name: seo-geo-readiness
description: Audit a website for GEO and AI-search readiness with seo. Use when the user asks about ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews, LLM citations, llms.txt, answer-ready content, structured data, authorship, or whether pages are likely to be understood and cited by AI systems.
---

# GEO readiness

Use `seo` to check whether pages are easy for AI systems to understand and cite.

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
- `geo_not_answerable`
- `geo_no_author`
- `geo_no_date`
- `geo_no_semantic_html`
- `geo_thin_to_cite`
- `geo_no_llms_txt`

4. Turn the gaps into a fix plan.

## How to explain GEO findings

Use plain words:

- Structured data helps machines understand entities, page type, facts, and authorship.
- Semantic HTML helps agents separate main content from navigation and boilerplate.
- Authorship and dates help with trust and freshness.
- Clear headings followed by direct answers make content easier to quote.
- Tables, lists, and short answer blocks are easier to extract.
- `/llms.txt` gives agents a map of the pages that matter most.

## Useful follow-up commands

```bash
seo seo-to-ai-query --project <project>
seo ai-referrals --project <project>
seo explain --rule geo_no_llms_txt
```

`seo-to-ai-query` turns retained GSC query wording into deterministic monitoring-prompt suggestions. These prompts are not observed AI demand. `ai-referrals` checks GA4 for known AI referral sources.

## Caveat to include

If the user asks whether they appear in AI answers, say the truth: this tool checks readiness and referral evidence. It does not yet run scheduled prompts across AI engines or track citations.
