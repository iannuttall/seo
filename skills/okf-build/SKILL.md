---
name: okf-build
description: Build a deterministic OKF Markdown knowledge bundle from a bounded crawl and validate its file contract. Use when an agent needs portable site evidence with explicit source selection and caveats.
---

# Build an OKF bundle

An OKF bundle packages crawl-derived concepts, page inventory, link relationships, provenance, and caveats as portable Markdown. The builder ranks eligible pages deterministically and limits the selected concepts. This makes the artifact reproducible, but it does not make extracted claims true or current.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only when discovery is needed. Call `seo_describe_report` with `{ "id": "okf-build" }`, then `seo_run_report` with:

```json
{
  "id": "okf-build",
  "params": {
    "reportId": "crawl_example_20260710",
    "maxConcepts": 25,
    "includeFiles": true,
    "title": "Example site knowledge"
  }
}
```

Check `isError`, then use `structuredContent`. CLI parity is:

```sh
seo reports describe okf-build --json
seo reports run okf-build --params '{"reportId":"crawl_example_20260710","maxConcepts":25,"includeFiles":true,"title":"Example site knowledge"}' --json
```

`includeFiles` is opt-in because file bodies can be large. Request only the manifest when discovering scope.

## Inspect the bundle

Read the manifest's schema version, report id, source URL, generation time, crawl status, title, concept count, file paths, warnings, and caveats. The `selection` block distinguishes source, eligible, duplicate-final, selected, and limited page counts and records the deterministic ordering. If selected pages equal the limit, treat the bundle as bounded rather than exhaustive.

Review the returned validation before using files. Then inspect citations, canonical URLs, titles, summaries, and relationships against source pages, especially for sensitive or time-dependent claims. The generated log and caveat files should travel with the bundle. A successful structural validation does not establish ownership, freshness, factual accuracy, completeness, or safe downstream use. Rebuild from a comparable fresh crawl when the site changes; do not silently merge snapshots with different scope.
