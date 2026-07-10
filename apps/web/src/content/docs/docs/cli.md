---
title: Use SEO Skills CLI for daily work and automation
description: Choose the right SEO command, switch projects safely, save technical evidence, and produce deterministic JSON that agents and CI can inspect.
---

The CLI has a short path for normal work and a report registry for agents and
scripts. You do not need to learn the whole command tree before getting a useful
answer.

## Get the answer without running the whole site

| Job | Start with |
| --- | --- |
| Broad review with recommended next steps | `seo report` |
| Rank the next search and technical actions | `seo refresh-priorities` |
| Find page-one rankings with weak CTR evidence | `seo quick-wins` |
| Review rankings averaging positions 10 to 20 | `seo second-page` |
| Check crawl and index monitoring evidence | `seo technical-watch` |
| Audit one live URL | `seo audit-page --url <url>` |
| Build a technical site baseline | `seo crawl <url> --save` |

Run `seo report` first when the request is broad. Pick a focused command when
the question already names the job. A one-page audit takes you straight to the
live evidence when one landing page is all you need to inspect.

The [report catalog](/docs/reports) explains what each report checks and when
its evidence is useful.

## Switch sites without copying property IDs

```sh
seo projects list
seo report --project example
seo crawl --project example --max-pages 500
```

`--project` is the public selector for saved profiles. A profile can hold the
Search Console property, default crawl URL, optional GA4 property, brand terms,
and reporting preferences.

Commands can still run without a profile when you provide their required site
or URL:

```sh
seo report --site sc-domain:example.com
seo crawl https://example.com
seo redirect-trace --url https://example.com/old-page
```

Use `seo start` to create the first profile. The [setup guide](/docs/getting-started)
covers multiple sites and local storage.

## Find search opportunities from first-party data

```sh
seo quick-wins --project example
seo second-page --project example
seo decaying --project example
seo cannibal --project example
seo ctr-underperformers --project example
seo page-opportunities --project example --url https://example.com/pricing
```

These reports use retained Search Console rows. Saved brand terms let reports
exclude branded queries where that comparison matters. Read the date window,
row limits, and omitted-query caveats before you call a list complete.

The [Google data guide](/docs/google) explains why Search Console chart totals
and exported query rows can differ.

## Save technical evidence before you change the site

```sh
seo crawl --project example --save
seo crawl-reports --project example
seo crawl-reports --project example --compare latest --against previous
```

A saved crawl gives you a baseline for deployment checks, technical follow-ups,
and agent questions. Reuse it when the page evidence is still current. Crawl
again after a release or when the stored result no longer represents the live
site.

The [crawler guide](/docs/crawler) covers limits, JavaScript rendering, robots
handling, exports, and severity gates.

## Use JSON when nobody is watching the terminal

JSON mode never prompts. Pass every selector a command needs:

```sh
seo report --project example --json
seo crawl https://example.com --json --output crawl.json
seo crawl https://example.com --fail-on high --json
```

Structured output keeps observed evidence, derived findings, skipped sections,
thresholds, source limits, and errors in fields a program can inspect. Do not
scrape the human table output.

`--fail-on high` returns a non-zero exit when the crawl contains findings at
that severity or above. The JSON still contains the evidence that caused the
gate to fail, which makes the command useful in CI logs.

## Keep scripts current as report inputs change

```sh
seo reports list --category opportunities --json
seo reports describe quick-wins --json
seo reports run quick-wins --params '{"site":"sc-domain:example.com"}' --json
```

`list` gives you compact report ids and descriptions. `describe` returns the
current input schema. `run` executes that registered report. The same registry
backs the CLI and [local MCP tools](/docs/mcp), so there is one implementation
of the analysis.

## Refresh only when you need fresh provider data

Many provider requests use a local cache to avoid repeated API calls. Add
`--refresh` when a command supports it and you need to bypass that cache:

```sh
seo report --project example --refresh
seo crawl --project example --refresh --save
```

Fresh does not mean final. Recent Search Console rows and GA4 processing can
still change at the provider.

## Get focused help in the terminal

```sh
seo help
seo report --help
seo crawl --help
seo help all
```

Root help keeps the common path short. `seo help all` lists the deeper command
tree when you need raw provider queries, experiments, exports, monitoring, or
local data controls.
