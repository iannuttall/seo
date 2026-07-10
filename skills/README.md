# Agent skills

These skills teach an agent how to use `seo` without reading the whole repo.

They work best with the MCP server installed:

```bash
seo mcp install
```

They can also call the CLI directly when the MCP tools are not available.

## Included skills

- `seo-site-audit`: run a full technical SEO and GEO audit.
- `seo-geo-readiness`: check AI-search readiness and citation gaps.
- `seo-fix-queue`: turn crawl results into an implementation queue.
- `pseo-audit`: audit repeated URL templates with GSC, crawl, and URL Inspection evidence.
- `index-watch`: monitor exact indexed-state evidence, transitions, failures, and quota-deferred checks.
- `performance`: separate Lighthouse lab diagnostics, CrUX field Core Web Vitals, and unscored fallback evidence.
- `community-intent`: review explicit intent language in retained GSC queries without claiming a page gap.
- `seo-to-ai-query`: create deterministic monitoring-prompt suggestions from retained GSC queries.

The existing `seo` skill is the broad tool-routing guide for the full MCP server.
