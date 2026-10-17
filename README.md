<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/s-dark.svg">
    <img src="assets/brand/s.svg" alt="SEO Skill" width="144">
  </picture>
</p>

<h1 align="center">SEO Skill</h1>

<p align="center">
  The SEO command for AI agents. A free Google Search Console MCP server and CLI: your agent reads your real Search Console, Google Analytics and Bing data, with Google update dates beside it, plus keyword research from your own DataForSEO or Ahrefs key.
</p>

<p align="center">
  <a href="#install-and-run-setup">Get started</a>
  ·
  <a href="https://seoskill.dev/docs/mcp">Hosted MCP</a>
  ·
  <a href="https://seoskill.dev/docs">Documentation</a>
  ·
  <a href="https://www.npmjs.com/package/seo">npm</a>
  ·
  <a href="https://github.com/iannuttall/seo/issues">Questions</a>
  ·
  <a href="https://seoskill.dev/privacy">Privacy</a>
  ·
  <a href="SECURITY.md">Security</a>
  ·
  <a href="LICENSE">License</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <a href="https://github.com/iannuttall/seo/actions/workflows/ci.yml"><img alt="Checks" src="https://img.shields.io/github/actions/workflow/status/iannuttall/seo/ci.yml?branch=main&label=checks&style=flat-square"></a>
  <a href="https://www.npmjs.com/package/seo"><img alt="npm version" src="https://img.shields.io/npm/v/seo?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/seo"><img alt="npm downloads" src="https://img.shields.io/npm/dm/seo?style=flat-square"></a>
  <img alt="Node 22 or newer" src="https://img.shields.io/badge/Node-22%2B-339933?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-ready-3178c6?style=flat-square">
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square"></a>
</p>

Ask your agent what is happening in search and get an answer built from your
own Search Console, Bing Webmaster Tools, Google Analytics and Clicky data,
with Google update dates laid over it. Add your own DataForSEO or Ahrefs key when you need keyword,
SERP, competitor or backlink data.

The results are facts with their dates and limits. There is no advice baked
in. Your agent reads the facts, shows you what matters and asks before it
changes a page.

## Install and run setup

You need Node 22 or newer.

```sh
npm i -g seo
seo start
```

`seo start` signs you in with Google. Then it offers to add an MCP server to
the agents it finds (the free hosted server is the first choice, or you can
run one locally) and to install the skill. That is all it asks. Nothing about
your site is saved: each command names the site it works on.

List the properties your sign-in can read, then run the main report for one:

```sh
seo sites
seo report --site example.com
```

## Connect the hosted MCP server

If you would rather not install anything, connect your agent to the free
hosted server at `https://seoskill.dev/mcp`:

```sh
claude mcp add --transport http seoskill https://seoskill.dev/mcp
codex mcp add seoskill --url https://seoskill.dev/mcp
```

Sign in with Google when the client asks. That first Google account is your
account, so there is no password or separate signup. The server keeps only
your linked Google accounts and any API keys you save, encrypted. It keeps no
report data, no Search Console or analytics rows and no request logs.

Your [account page](https://seoskill.dev/account) lets you add more Google
accounts, save DataForSEO or Ahrefs keys, or delete everything.
Each request uses the linked Google account that can read the site. The
[hosted MCP guide](https://seoskill.dev/docs/mcp) covers other clients, and the
[API keys guide](https://seoskill.dev/docs/keys) shows how to add a key
without pasting it into a chat.

A crawl fetches many pages, so `seo crawl` and `seo internal-links` run only
on your machine, through the CLI or the local MCP server. Bing data also runs
only there for now; when you ask the hosted server for Bing, it tells your
agent which CLI command to run.

## The eight commands

| Command | MCP tool | What it returns |
| --- | --- | --- |
| `seo report` | `seo_report` | The main report: an overview against the previous period, then every section's count and top rows |
| `seo page --url <url>` | `seo_page` | One URL: live page facts, Google index status and its queries |
| `seo compare --date <date>` | `seo_compare` | Equal periods before and after a date, with the Google updates in the window |
| `seo index` | `seo_index` | Pages that lost most of their clicks, checked live and with URL Inspection |
| `seo research <action>` | `seo_research` | Keyword metrics, ranked keywords, SERPs, competitors and backlinks from your key |
| `seo data` | `seo_data` | Raw Search Console rows, or Bing rows in the CLI and local server; the hosted tool also reads analytics landing pages |
| `seo crawl <url>` | `seo_crawl` | A site crawl with technical issues and the URLs they affect (local only) |
| `seo internal-links --url <url>` | `seo_internal_links` | Pages that could link to a target page (local only) |

Each command takes its target (a site, URL or property) and an optional date
window. `--site` takes a domain, a URL or a Search Console property, and
`seo sites` lists the ones you can read. Commands that return rows also take `--detail summary|rows|full` and
`--offset`. Brand terms, minimum impressions and the comparison period are set
for you and shown in the output, so there is nothing else to tune.

Run `seo help` for the short list, or `seo <command> --help` for one command.
The [command docs](https://seoskill.dev/docs) explain each one.

## Start with one report

Run the report without a section first:

```sh
seo report --site example.com
```

It shows site totals against the previous period, the pages and queries that
moved, and a short count with top rows for each section. Then ask for the one
section that matters:

```sh
seo report --site example.com --section quick-wins
```

The sections are `overview`, `quick-wins`, `low-ctr`, `striking-distance`,
`second-page`, `content-decay`, `cannibalization`, `traffic-drop` and `bing`.
Page sections check their top 20 URLs live and merge same-site redirects.

Each result ends with the command to run next. A traffic drop usually leads to
`seo compare` with the date it started, then `seo page` for the URLs that
moved:

```sh
seo compare --site example.com --date 2026-09-15
seo page --url https://example.com/pricing
```

Start with the summary. Ask for `--detail rows --offset 20` for the next page
of rows, or `--detail full` for every field, only when you need them.

## Add keyword and competitor data

Research uses your own provider account, so each request costs your credits
with that provider. Connect a key once:

```sh
seo providers dataforseo connect
seo providers ahrefs connect
```

On the hosted server, save the keys on your
[account page](https://seoskill.dev/account) or send them as headers. Then ask
for one action:

```sh
seo research keyword_metrics --keywords "invoice software,invoice template"
seo research serp --keywords "invoice software"
seo research ranked_keywords --target example.com
seo research competitors --target example.com
seo research backlinks --target example.com
```

Rows with a domain get a free Domain Rating column, credited "Domain Rating by
Ahrefs". The hosted server adds it for everyone; the CLI adds it when you have
saved an Ahrefs key. Provider numbers are estimates. Search Console stays the
record of what your own site actually got.

## Add Bing Webmaster Tools

Bing data is free. It works in the CLI and the local MCP server. Save a Bing
Webmaster API key (Bing Webmaster Tools, then Settings, then API access):

```sh
seo providers bing connect
```

Agents and CI can set `SEO_BING_API_KEY` instead. `seo providers bing status`
shows the connection and `seo providers bing disconnect` removes it. The
hosted server has no Bing for now. When you ask it for Bing, it tells your
agent to run the CLI instead, the same way it does for a crawl.

`seo report` then shows Google and Bing clicks and impressions for the same
dates, and each engine's share of those clicks. The `bing` section puts Bing's
top queries and pages beside Google's numbers for the same rows, and
`seo data --source bing` returns the raw Bing rows. Bing and Google numbers sit
side by side and are never added together. Bing lists only its top queries
and pages by week, so a row missing from Bing's list is unknown, not zero.

## Add your analytics

Google Analytics comes with your Google sign-in. List your properties, then
pass the numeric property id to a Google Analytics command:

```sh
seo analytics google properties
seo ai-referrals --property 123456789
```

For Clicky, save your Clicky account login (every site) or one site's ID and
sitekey on your [account page](https://seoskill.dev/account#clicky). The
hosted server and a CLI linked with `seo login` both read them:

```sh
seo data --source clicky --site example.com
```

A site saved on this machine only with
`seo analytics clicky connect --site-id 12345` works too, by its site ID.

There will be no more built-in sources. For any other analytics or research
tool, build your own provider package from the
[provider template](https://github.com/iannuttall/seo-provider-template). Each source keeps its own metric names, so a
Clicky visit is never relabelled as a Google Analytics user.

## Use it with agents

The skill teaches your agent the eight commands, the one-report flow and the
evidence rules. If you skipped it during `seo start`, add it now:

```sh
seo skill install
```

`seo start` can add the hosted or the local MCP server for you. To add the
local MCP server later, to Codex, Claude Code, Claude Desktop or Cursor:

```sh
seo mcp install
```

Scripts can pick clients with `--codex`, `--claude-code`, `--cursor` or
`--claude-desktop`. Other clients can start `seo mcp serve` as a local stdio
server.

The local server and the hosted server serve the same tools: `seo_sites`,
`seo_report`, `seo_page`, `seo_compare`, `seo_index`, `seo_research` and
`seo_data`. The local server adds `seo_crawl` and `seo_internal_links`, plus
`seo_list_providers`, `seo_describe_provider` and `seo_run_provider` for
installed provider packages.

## What the results can show

- Missing, partial, capped and filtered data is named. It never becomes a zero
  or an all-clear.
- Search Console, Bing, analytics, live page checks and provider estimates stay
  apart. Query rows do not add up to site totals.
- Flags such as likely automated queries and CTR gaps against the site's own
  curve are heuristics. They point at rows worth a look.
- A Google update in the same window is timing, not cause.
- An intentional `noindex`, canonical or redirect is an observation until you
  say it is wrong.

Nothing here promises clicks, rankings or indexing. Check a change by running
the same command again over a later, complete window.

## Upgrading from 0.3

Saved project profiles are gone. Every command takes `--site` (or `--url`), and
`--project` or `--client` now stops with a note that says so. `seo projects`,
`seo client` and the commands that saved history between runs (`change-log`,
`tests`, `content-groups`, `monitoring`, `schedule`, `index-watch`,
`technical-watch`, `crawl-reports`, `crawl-diff` and `diagnose`) were removed.
Your agent keeps its own notes now. Each removed command names what to use
instead. To stay on the old version, run `npm i -g seo@0.2.41`.

## Upgrading from 0.2

Version 0.3.0 moved most reports into the eight commands. Old names such as
`seo quick-wins` still run in 0.3 and print the new command to use. They stop
working in 0.4.0. Some reports and commands were removed, including rank
tracking, programmatic SEO, AI search readiness, llms.txt, Bing links,
IndexNow, Semrush, local search, server logs and the monthly and narrative
reports. Bing Webmaster search data came back in 0.3.0-beta.3. The old
research reports became `seo research`. The [changelog](CHANGELOG.md) lists
every old name and where it went.

## Use it in CI and scripts

Add `--json` to any command. JSON mode never prompts. Pass `--site` every
time.

```sh
seo report --site sc-domain:example.com --json
seo report --site sc-domain:example.com --section content-decay --json
```

A CI job can read Search Console with a Google service account. Give it the
JSON key through your secret store and grant it access to the exact
properties:

```yaml
- name: Run the SEO report
  run: |
    npm i -g seo
    seo report --site sc-domain:example.com --json > seo-report.json
  env:
    SEO_GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.SEO_GOOGLE_SERVICE_ACCOUNT_JSON }}
```

## Use it as a library

Install the same package in any Node 22 or newer project:

```sh
npm install seo
```

```ts
import { executeReport } from 'seo/mcp'
import { crawlSite } from 'seo'

const wins = await executeReport('quick-wins', {
  site: 'sc-domain:example.com',
})

const crawl = await crawlSite({
  url: 'https://example.com',
  maxPages: 100,
})

console.log(wins)
console.log(crawl.summary, crawl.issueGroups)
```

`seo/provider-sdk` is the public contract for provider packages. Start from
the [provider template](https://github.com/iannuttall/seo-provider-template).

## Local data and Google access

Google tokens use your system keychain, with a private `0600` file fallback on
headless machines. Settings, provider keys and a short cache of Google
responses stay in your local config directory. Reports and crawls are not
saved: each run returns its results and your agent decides what to keep. A command still reaches the network when it needs Google,
your site or a provider you connected.

```sh
seo privacy
seo doctor
seo auth logout --all
seo reset
```

The hosted server keeps only your linked sign-ins and saved keys, encrypted,
and no report data or logs. Read the
[privacy policy](https://seoskill.dev/privacy) for every network boundary and
the [telemetry page](https://seoskill.dev/telemetry) for the anonymous usage
counts and how to turn them off.

## Documentation

Questions, bug reports and feature requests go through
[GitHub Issues](https://github.com/iannuttall/seo/issues). Report suspected
vulnerabilities privately through the process in [SECURITY.md](SECURITY.md).

- [Getting started](https://seoskill.dev/docs/getting-started)
- [Hosted MCP](https://seoskill.dev/docs/mcp)
- [API keys](https://seoskill.dev/docs/keys)
- [Your hosted account](https://seoskill.dev/account)
- [CLI](https://seoskill.dev/docs/cli)
- [Commands](https://seoskill.dev/docs)
- [What is stored](https://seoskill.dev/docs/privacy)
- [Privacy policy](https://seoskill.dev/privacy)
- [Public usage stats](https://seoskill.dev/stats)
- [Terms of use](https://seoskill.dev/terms)
- [Contributing](CONTRIBUTING.md)
- [Trademark and brand policy](TRADEMARKS.md)

## Develop locally

Most users do not need the source checkout. If you want to contribute:

```sh
git clone https://github.com/iannuttall/seo.git
cd seo
pnpm install
pnpm build
node dist/cli.js start --dry-run
```

Run the full quality gate before opening a pull request:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm pack --dry-run
```

Contributor architecture and report rules live in [AGENTS.md](AGENTS.md).

## License

The code is available under [Apache-2.0](LICENSE). Project names and artwork are
covered separately by the [trademark and brand policy](TRADEMARKS.md).
