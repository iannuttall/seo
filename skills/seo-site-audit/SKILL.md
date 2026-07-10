---
name: seo-site-audit
description: Run an evidence-backed site audit with the seo main report, crawler, and focused follow-up reports. Use when the user asks to audit or diagnose a website across Search Console performance, technical SEO, indexability, metadata, schema, internal linking, security, performance, or AI-search readiness.
---

# SEO site audit

Start with the main report. It joins the available first-party evidence and
returns a small set of follow-up commands.

Through MCP, call `seo_run_report` with report id
`workflow-diagnose-property`. Call `seo_describe_report` first when its
parameters are not already known. Use the CLI when MCP is not available:

```bash
seo report --project <project> --json
seo report --site sc-domain:example.com --json
```

## Read the main report

1. Check `dataStatus`, source completeness, skipped sections, warnings, and
   caveats before interpreting findings.
2. Read the narrative and priority queue against their evidence references.
3. Use `nextCommands` to choose a small number of follow-ups. Do not run every
   report by default.
4. Keep missing, unavailable, filtered, partial, capped, and complete evidence
   separate. A partial source cannot support an all-clear.

## Add technical crawl evidence

Run a crawl when the user asks for technical coverage or the main report
identifies a technical evidence gap:

```bash
seo crawl --project <project> --max-pages 500 --save --json
seo crawl https://example.com --max-pages 500 --save --json
```

Read `summary`, `topFixes`, `warnings`, and `caveats` first. Check
`summary.pageLimitReached` before making sitewide claims. Reuse the saved report
for detail instead of crawling again:

- Report id `top-fixes` returns a bounded queue.
- Report id `affected-urls` returns URLs for one rule.
- Report id `explain-issue` explains an unfamiliar rule.
- Report id `get-crawl-report` returns requested report detail.

Use report id `performance-audit` for a selected URL when performance evidence
is needed. A crawl does not replace Lighthouse lab data or CrUX field data.

## Present the result

Give the user the top three to five evidence-backed actions, affected areas,
and a verification command for each action. Name every material gap or cap.

Never invent clicks, sessions, rankings, issue counts, indexing state, or
sitewide health. Keep advice structural and diagnostic unless the user asks
for copy.
