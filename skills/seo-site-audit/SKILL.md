---
name: seo-site-audit
description: Run a complete technical SEO and GEO audit with the seo CLI or MCP server. Use when the user asks to crawl, audit, or check a website for broken links, redirects, metadata, indexability, schema, content, internal linking, performance, security, or AI-search readiness issues.
---

# SEO site audit

Use `seo` to produce a short, useful audit. Do not paste raw crawl JSON into the answer unless the user asks for it.

## Pick the best interface

1. If `seo_*` MCP tools are available, prefer them.
2. Otherwise use the local CLI.
3. If neither works, tell the user to run `pnpm build` in the repo or install the published package once it exists.

CLI examples use `seo`. In a source checkout, use `node packages/cli/dist/index.js` if the binary is not linked.

## Workflow

1. Identify the site or project profile.
2. Run a crawl.

```bash
seo crawl --project <project> --max-pages 500 --json
```

For a raw URL:

```bash
seo crawl https://example.com --max-pages 500 --json
```

3. Read `summary`, `topFixes`, `warnings`, and `caveats` first.
4. Use `seo explain --rule <rule>` or `seo_explain_issue` for unfamiliar rule ids.
5. Use affected URLs for exact implementation work.

```bash
seo crawl-reports --latest --json
```

If using MCP, prefer:

- `seo_crawl_site`
- `seo_top_fixes`
- `seo_affected_urls`
- `seo_explain_issue`
- `seo_get_crawl_report`

## Output shape

Give the user:

- one sentence on overall health
- the top 3 to 5 fixes
- why each fix matters
- where to start
- how to verify the fix
- warnings or caveats if data was sparse

Mention GSC or GA4 joins only when they materially affect priority.

## Guardrails

- Do not invent clicks, sessions, rankings, or issue counts.
- If a section is sparse, say so plainly.
- Keep advice structural and diagnostic unless the user asks for copy.
- Use rule ids when the user or agent needs exact implementation work.
