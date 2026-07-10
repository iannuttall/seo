---
name: audit-urls
description: Audit a known URL set without implying sitewide coverage and optionally save the snapshot for follow-ups. Use for release checks, templates, migrations, or a bounded remediation list.
---

# Audit an explicit URL list

Use this report when the URLs are already known. It avoids sitemap discovery and link traversal, so the result answers "what was observed on these pages?" rather than "what is wrong across the site?" This makes it useful for pre-release checks, representative templates, and verifying a fix list.

## Run it

For MCP, discover with `seo_list_reports` category `crawl` only if needed. Describe the contract with `seo_describe_report` and `{ "id": "audit-urls" }`. Then call `seo_run_report` with:

```json
{
  "id": "audit-urls",
  "params": {
    "urls": [
      "https://example.com/",
      "https://example.com/pricing"
    ],
    "includeIssues": true,
    "saveReport": true
  }
}
```

Check `isError`, then consume `structuredContent`. CLI parity is exact:

```sh
seo reports describe audit-urls --json
seo reports run audit-urls --params '{"urls":["https://example.com/","https://example.com/pricing"],"includeIssues":true,"saveReport":true}' --json
```

## Read and verify

Compare requested URLs with attempted, fetched, failed, retained, and omitted counts. Review response evidence, issue summaries, `requestEvidenceStatus`, warnings, and caveats before acting. `includeIssues` returns the rule inventory; `includePages` adds larger page and request records and should only be enabled when the decision needs them. Saving the report gives later commands a stable `reportId`.

A successful sample does not prove the same template works everywhere, and a failed request may reflect a transient network condition rather than a persistent SEO defect. Group findings by shared implementation, confirm intentional canonicals, robots directives, and `noindex` settings with the publisher, then fix the template rather than individual URLs where appropriate. Re-run the identical URL list after deployment. A URL omitted from the next request is not a verified fix, and this bounded audit must never be described as complete site coverage.
