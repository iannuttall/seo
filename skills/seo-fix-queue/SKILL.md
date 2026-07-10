---
name: seo-fix-queue
description: Turn seo crawl and report evidence into a prioritized implementation queue. Use when the user wants exact SEO fixes, implementation tickets, affected URLs, verification steps, or a ranked technical SEO and GEO backlog.
---

# SEO fix queue

Run the bounded queue directly:

```bash
seo crawl-queue --project <project> --json
seo crawl-queue https://example.com --json
```

Through MCP, use `seo_run_report` with report id `crawl-site` and
`saveReport: true`. Pass its `reportId` to report ids `top-fixes` and
`affected-urls`. Reuse that report instead of crawling again. Call
`seo_describe_report` before a report when its parameters are not already
known.

## Check the evidence before ranking work

1. Read `dataStatus`, source joins, selection counts, warnings, and caveats.
2. Check `summary.pageLimitReached`. A capped crawl cannot support an
   inventory-wide zero or all-clear.
3. Preserve the returned priority order unless stronger evidence supports a
   change.
4. Use GSC or GA4 evidence only when the source join is available. Do not call a
   page search-visible or valuable from crawl evidence alone.
5. Keep failed fetches, missing provider data, and filtered rows separate from
   observed zeros.

Each queue item should retain its rule id, priority, evidence, affected count,
bounded URL sample, fix, and verification step. Explain unfamiliar rules with
structured output:

```bash
seo explain --rule <rule-id> --json
```

Use report id `explain-issue` through `seo_run_report`.

Write Markdown implementation tickets only when the user wants a handoff file:

```bash
seo crawl --project <project> --format markdown --output seo-fixes.md
```

Keep the final answer short. Show the top material fixes and end with the next
verification command. Do not dump every rule the crawler checked.
