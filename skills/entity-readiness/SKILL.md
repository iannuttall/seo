---
name: entity-readiness
description: Inventory entity-related markup and identity signals without claiming recognition or authority. Use when reviewing schema types, names, authors, dates, sameAs links, and social references across crawlable pages.
---

# Review entity readiness

Consistent names, authorship, structured data, and external identity references can make a site easier to interpret. This report measures those observable signals across evaluated pages. It does not score authority, validate ownership of linked profiles, or prove that any search or AI system recognizes an entity.

## Run it

For MCP, discover the report with `seo_list_reports` category `crawl` only when necessary. Call `seo_describe_report` with `{ "id": "entity-readiness" }`, then `seo_run_report` with:

```json
{
  "id": "entity-readiness",
  "params": { "reportId": "crawl_example_20260710" }
}
```

Use `structuredContent` after confirming `isError` is false. CLI parity is:

```sh
seo reports describe entity-readiness --json
seo reports run entity-readiness --params '{"reportId":"crawl_example_20260710"}' --json
```

Pass `url` only when a fresh crawl is intended. A saved report keeps this inventory aligned with other technical findings.

## Read the observations

Check `dataStatus`, `evaluatedPages`, `crawlPages`, and caveats before interpreting coverage. The analysis evaluates eligible, successfully fetched pages; skipped or non-indexable pages are not evidence of absence. Checks are informational observations with counts and coverage, not pass/fail requirements.

Use `entities.schemaTypes` to see which types were parsed, `sameAsByType` and `sameAs` to review identity references, `socialProfiles` to inspect linked profiles, and `authors` to find observed bylines or structured authors. Sample the source pages before recommending global markup changes: a product, article, person, and organization need different semantics. Fix malformed or inconsistent markup only when the page's real subject supports it. Confirm names, URLs, authorship, and dates with the publisher, then re-crawl the same scope. Never infer Knowledge Graph inclusion, ownership, expertise, rankings, visibility, or citations from these signals alone.
