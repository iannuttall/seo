---
name: seo-fix-queue
description: Turn seo crawl and report data into a prioritized implementation queue. Use when the user wants exact SEO fixes to work through, implementation tickets, affected URLs, verification steps, or a ranked technical SEO and GEO backlog.
---

# SEO fix queue

Use `seo` to turn audit data into work someone can actually do.

## Workflow

1. Prefer a saved project profile.

```bash
seo crawl-queue --project <project> --json
```

2. If there is no queue command available, run a saved crawl and inspect top fixes.

```bash
seo crawl --project <project> --save --json
```

3. For each top fix, gather affected URLs.

With MCP:

- `seo_top_fixes`
- `seo_affected_urls`
- `seo_explain_issue`

With CLI:

```bash
seo explain --rule <rule-id>
```

4. Produce a queue, not a generic audit.

Each item should include:

- priority
- rule id
- plain-English title
- why it matters
- affected URL count
- first few URLs
- exact fix
- verification command

## Ranking rules

Prioritize:

1. high severity issues on search-visible pages
2. broken or blocked pages with GSC clicks or impressions
3. medium issues affecting many indexable pages
4. GEO issues on pages with traffic or strategic value
5. low-severity sitewide cleanup after material fixes

Do not let low-severity sitewide noise bury important medium fixes.

## Output style

Be direct. Use short sections. Do not tell the user every rule the crawler checked.

End with the next command to verify the work.

