---
name: list-rules
description: Discover stable crawler rule ids with their categories and guidance metadata before querying findings. Use when an agent needs a valid filter for explanations or affected-URL reports.
---

# Discover crawler rules

Rules are the stable vocabulary connecting crawl issues, summaries, affected URLs, and remediation guidance. Listing them answers "which checks exist?" It does not say that a site triggered those checks or that every listed convention is a search-engine requirement.

## Run it

For MCP, use `seo_list_reports` with category `crawl` only if report discovery is needed. Call `seo_describe_report` with `{ "id": "list-rules" }`, then `seo_run_report` with:

```json
{
  "id": "list-rules",
  "params": { "category": "metadata" }
}
```

Read `structuredContent` after checking `isError`. CLI parity is:

```sh
seo reports describe list-rules --json
seo reports run list-rules --params '{"category":"metadata"}' --json
```

Omit `category` to discover the full inventory. Useful categories include response, indexability, canonical, metadata, headings, content, links, images, structured-data, international, performance, mobile, security, social, and geo.

## Use ids, not prose

Read the returned id, title, category, default severity, and guidance metadata. Pass the exact id to `explain-issue` for the rule contract or to `affected-urls` for crawl evidence. Do not infer that similarly named rules have identical source semantics, and do not create implementation work from the catalog alone.

The category input is constrained to the crawler's supported category enum. Describe the report before filtering and pass one of those exact values; unknown or misspelled categories are rejected as invalid input rather than becoming a misleading empty result. A valid category can still return no rules if the registry changes, so use the unfiltered inventory for discovery. Treat default severity as general triage metadata; actual priority comes from affected pages, observed evidence, scope, intent, and available demand data.
