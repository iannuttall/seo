---
title: CLI guide
description: Use the short report path for day-to-day work and explicit flags for scripts, CI, and deeper analysis.
---

## Everyday commands

```sh
seo start
seo report
seo refresh-priorities
seo quick-wins
seo second-page
seo technical-watch
```

`seo report` is the main report. It reads the evidence available for the
selected project, explains gaps, and recommends focused follow-ups.

## Project profiles

```sh
seo projects list
seo report --project example
seo crawl --project example --max-pages 500
```

`--project` is the public selector for saved profiles. Commands that accept a
site or URL can still run without one.

## Search opportunities

```sh
seo quick-wins --project example
seo second-page --project example
seo decaying --project example
seo cannibal --project example
seo ctr-underperformers --project example
seo internal-links --project example --url https://example.com/page
```

These reports use Search Console data. Saved brand terms let opportunity
reports exclude branded queries where that distinction matters.

## JSON and CI

JSON mode never prompts. Pass the project, site, URL, or property explicitly.

```sh
seo report --project example --json
seo crawl https://example.com --json --output crawl.json
seo crawl https://example.com --fail-on high --json
```

Automation can inspect structured evidence, findings, skipped sections,
limits, and provider errors without parsing terminal prose.

## Discover every report

```sh
seo reports list --json
seo reports describe audit-page --json
seo reports run audit-page --params '{"url":"https://example.com"}' --json
```

The generic report runner is the low-level path for agents and scripts. It
shares ids, schemas, and implementations with the compact MCP catalog.

## Find the rest

Run `seo help` for the curated path, `seo help all` for every command, or
append `--help` to a command for its arguments.
