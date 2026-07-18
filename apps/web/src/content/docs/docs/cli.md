---
title: SEO CLI commands
description: Use the SEO CLI to audit a site, investigate lost traffic and save evidence before you make a change. Scripts and CI can run the same reports as JSON.
---

The CLI has a short path for normal work and a report registry for agents and
scripts. You do not need to learn the whole command tree before getting a useful
answer.

## Get the answer without running the whole site

| Job | Start with |
| --- | --- |
| Broad review with recommended next steps | `seo report` |
| Broad technical review before connecting Google | `seo report --url <url>` |
| Rank the next search and technical actions | `seo refresh-priorities` |
| Find page-one rankings with weak CTR evidence | `seo quick-wins` |
| Review rankings averaging positions 10 to 20 | `seo second-page` |
| Check crawl and index monitoring evidence | `seo technical-watch` |
| Audit one live URL | `seo audit-page --url <url>` |
| Build a technical site baseline | `seo crawl <url> --save` |
| Notify search engines about changed URLs | `seo indexnow submit --dry-run` |

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
Search Console property, default crawl URL, optional Google Analytics property, brand terms,
and reporting preferences.

Commands can still run without a profile when you provide their required site
or URL:

```sh
seo report --site sc-domain:example.com
seo report --url https://example.com
seo crawl https://example.com
seo redirect-trace --url https://example.com/old-page
```

`seo report --url` creates a bounded local crawl and skips Search Console
analysis on purpose. It is the right first run for a site you have not
connected yet. Add `--site` or `--project` when the report should join search
performance data.

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

## Reuse the same page or query group

`seo content-groups` saves a page or query pattern on your machine. Use a group
when the same set needs to appear in change measurement more than once. A group
id is calmer and less error-prone than copying a long URL list into every
command.

Create a page group for one site:

```sh
seo content-groups add --site sc-domain:example.com --name "Blog pages" --dimension page --match contains --pattern "/blog/"
seo content-groups list --site sc-domain:example.com
seo content-groups --help
```

`--dimension` accepts `page` or `query`. `--match` accepts `equals`, `contains`,
or `regex`. The command stores the site, name, dimension, match type, and
pattern. It does not crawl the site or check whether every intended URL matches
the pattern, so test a regex before you use it for measurement.

The add command returns a reusable group id. List output shows each saved
group and its filter. Add `--json` when an agent or script needs the complete
record.

Use that id as the target of a group-scoped change:

```sh
seo change-log add --site sc-domain:example.com --scope group --target <group-id> --title "Updated blog titles" --date 2026-05-12
seo change-log measure --id <change-id> --json
```

Page groups can scope compatible Search Console and Google Analytics evidence. Query groups
scope Search Console evidence and do not attach unfiltered sitewide Google Analytics data.
The measurement still shows correlation around a recorded change, not proof
that the change caused the movement.

Delete a group only when later measurements no longer need it:

```sh
seo content-groups delete --id <group-id>
```

Deleting the local group does not change the site, Search Console, or Google Analytics. The
[change measurement report](/docs/reports/measure-change) explains finalized
windows, control evidence, and confounders.

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

Fresh does not mean final. Recent Search Console rows and Google Analytics processing can
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
