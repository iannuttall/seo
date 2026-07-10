---
name: seo-to-ai-query
description: Convert retained Google Search Console queries into deterministic AI monitoring-prompt suggestions. Use when an agent needs a bounded prompt set based on first-party search wording for manual or external AI visibility monitoring.
---

# SEO to AI query prompts

Call the `seo_to_ai_query` MCP tool. Use the CLI when MCP is unavailable:

```bash
seo seo-to-ai-query --project <project> --json
```

For a reproducible prompt set pass `startDate` and `endDate` to MCP or use `--start-date` and `--end-date` in the CLI. Keep the range inside `source.availableDateWindow`. Do not combine an exact range with `days`.

## Build the prompt set

1. Check `dataStatus`, `source.completeness`, `warnings`, and `caveats`.
2. Use `summary.eligibleQueries` for the retained candidates after filters. Use `summary.returnedQueries` for the limited set converted to prompts.
3. Keep the prompt wording unchanged when repeatable monitoring matters.
4. Store the source query and date range beside every prompt result collected elsewhere.

Generated prompts are deterministic suggestions. They are not queries observed in ChatGPT, Gemini, Copilot, or another AI product. They do not prove AI demand, visibility, citations, or referral traffic.

Use `seo_ai_referrals` for GA4 referral evidence. Use a separate prompt-monitoring provider or manual checks to measure AI answers and citations.

Use explicit `brandTerms` when the brand cannot be derived reliably from the property. Keep `includeBrand` false unless branded prompts are required.
