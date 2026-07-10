---
name: generate-llms-txt
description: Generate a bounded llms.txt draft from eligible crawl pages while exposing its URL and token budgets. Use when an agent needs a reviewable starting point rather than an automatically publishable file.
---

# Generate an llms.txt draft

This report turns crawl evidence into concise agent-facing navigation. It selects successfully fetched, indexable pages, removes common utility paths, groups suitable URLs, and stops at explicit URL and token budgets. The output is a draft: the crawler cannot determine publisher intent or guarantee factual summaries.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only if discovery is needed. Call `seo_describe_report` with `{ "id": "generate-llms-txt" }`, then call `seo_run_report` with:

```json
{
  "id": "generate-llms-txt",
  "params": {
    "reportId": "crawl_example_20260710",
    "maxUrls": 50,
    "tokenBudget": 4000,
    "exclude": ["/account/*", "/search"]
  }
}
```

Check `isError` and consume `structuredContent`. CLI parity is:

```sh
seo reports describe generate-llms-txt --json
seo reports run generate-llms-txt --params '{"reportId":"crawl_example_20260710","maxUrls":50,"tokenBudget":4000,"exclude":["/account/*","/search"]}' --json
```

## Review before publishing

Inspect `content`, `includedUrls`, `estimatedTokens`, and `sections`. Confirm every URL is canonical, public, current, useful to an agent, and safe to promote. Review generated titles and descriptions against the pages themselves. Use exclusions for private, transactional, faceted, search, or low-value routes, and keep the file deliberately small.

Load the source with `crawl-report` to check its date, page cap, failures, and caveats. The generator currently does not return a separate candidate count, omitted count, source metadata block, or explicit truncation flag. Reaching `maxUrls` or the token budget should therefore be treated as possible truncation, not a complete inventory. A technically valid draft does not prove search or AI benefit, selection, indexing, visibility, or citations. Publish only after human review, then fetch the final file and validate its links.
