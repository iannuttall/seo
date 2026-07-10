---
name: community-intent
description: Find explicit forum, comparison, review, experience, and recommendation language in retained Google Search Console queries. Use when an agent needs to review community-style search intent, rank query hypotheses, or decide which ranking pages need manual intent and SERP inspection.
---

# Community intent

Call `seo_list_reports` with category `ai-search` when discovery is needed.
Call `seo_describe_report` with id `community-intent`, then call
`seo_run_report` with that id and only the described parameters. Read
`structuredContent` as the machine contract. Use the CLI when MCP is
unavailable:

```bash
seo community-intent --project <project> --json
```

For a reproducible report pass `startDate` and `endDate` to MCP or use `--start-date` and `--end-date` in the CLI. Keep the range inside `source.availableDateWindow`. Do not combine an exact range with `days`.

## Read the evidence first

1. Check `dataStatus`, `source.completeness`, `warnings`, and `caveats`.
2. Use `selection.classifiedRows` for every retained match. Use `selection.returnedRows` for the limited result set.
3. Treat a capped or partial zero as inconclusive. GSC may omit lower-click queries.
4. Report `intent`, `signals`, and `matchedTerms` as low-confidence language heuristics.

The classifier uses English patterns. It does not inspect the live SERP, identify the ranking URL, or verify page content. Never state that a page has a content gap from this report alone.

## Turn a result into an action

Use each item as a review queue. Retrieve GSC query/page rows to identify every associated URL, inspect the current search results, then check each relevant page against the observed query language. Recommend a content change only when page or SERP evidence supports it.

Use explicit `brandTerms` when the brand cannot be derived reliably from the property. Keep `includeBrand` false unless branded demand is part of the question.
