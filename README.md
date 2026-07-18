<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/s-dark.svg">
    <img src="assets/brand/s.svg" alt="SEO Skill" width="144">
  </picture>
</p>

<h1 align="center">SEO Skill</h1>

<p align="center">
  The only SEO skill your agent needs. 50+ SEO audit tools through a local CLI and MCP server, using your own crawl, Search Console, and Google Analytics data.
</p>

<p align="center">
  <a href="#quick-start">Get started</a>
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
  <a href="AGENTS.md">Agent notes</a>
</p>

<p align="center">
  <a href="https://github.com/iannuttall/seo/actions/workflows/ci.yml"><img alt="Checks" src="https://img.shields.io/github/actions/workflow/status/iannuttall/seo/ci.yml?branch=main&label=checks&style=flat-square"></a>
  <a href="https://www.npmjs.com/package/seo"><img alt="npm version" src="https://img.shields.io/npm/v/seo?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/seo"><img alt="npm downloads" src="https://img.shields.io/npm/dm/seo?style=flat-square"></a>
  <img alt="Node 22 or newer" src="https://img.shields.io/badge/Node-22%2B-339933?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-ready-3178c6?style=flat-square">
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square"></a>
</p>

The `seo` command runs a full SEO audit from your terminal, turning a local
crawl and your own search data into work you can inspect and ship. Find
technical blockers, recover search demand, improve pages already close to more
clicks, and catch regressions after a release.

## Who this is for

- People running their own sites who want a clear audit and a ranked list of
  fixes, without learning a heavy dashboard.
- AI agents that need real crawl, Search Console, and Google Analytics evidence through MCP
  and one packaged SEO skill instead of screenshots or guesses.
- Developers who want to embed the same report engine in a script, a CI job, or
  a TypeScript app.

## Quick start

Requires Node 22 or newer.

```sh
npm i -g seo
seo start
seo report
```

The setup walks you through Google sign-in, your Search Console property, an
optional Google Analytics property, and a local project profile. Public releases can include
the shared Google app. If it is unavailable in your build, setup guides you
through adding your own desktop OAuth client.

That is the normal path. The `seo` command is then available in every terminal,
script, CI job, and local MCP client on the machine.

The main report uses the evidence you have, explains what it could not check,
and recommends a short list of follow-up commands. You can start with a local
technical report before connecting Google.

Running `seo help` shows the shape of the tool:

```txt
seo v0.2.10

Run SEO audits, find what needs fixing, and ship the changes with your agent.

Start here
  seo start                                Connect Google and save a project profile
  seo report                               Run the main SEO report for the default project
  seo report --site sc-domain:example.com  Run without a profile
  seo report --url https://example.com     Start with a local technical report

Projects
  seo projects list  List saved project profiles
  seo projects add   Create or update a project profile
  seo sites          List Search Console properties
  seo doctor         Check local auth and config

Act on a report
  seo refresh-priorities  Rank the next best SEO actions
  seo quick-wins          Find ranking 4-10 low-CTR wins
  seo second-page         Investigate URLs averaging positions 10-20
  seo technical-watch     Crawl and index-monitor a site

Agent and power tools
  seo report --json    Run the main report as structured JSON
  seo export diagnose  Export report data to CSV
  seo mcp install      Install SEO tools into MCP clients
  seo skill list       Show the packaged SEO skill
  seo reports list     Discover every structured report

Use `seo help <command>` or `seo <command> --help` for command help.
Use `seo help all` for the longer command list.
```

## What you get

- Find technical blockers across metadata, links, indexability, canonicals,
  structured data, performance, security, mobile, international SEO, and
  social previews.
- Rank the work using affected URLs, rule severity, search visibility, and
  analytics value instead of treating every warning equally.
- See why a finding matters, what evidence supports it, how to fix it, and how
  to verify the change.
- Save and compare crawl reports without running the same crawl again.
- Measure SEO changes with matched before and after Search Console windows.
- Give scripts and agents deterministic JSON, Markdown, stable rule IDs, and a
  compact local MCP surface.

## How the reports stay honest

The point of a report is to be defensible, so the design keeps a few rules:

- Observed evidence stays separate from derived findings and recommended
  actions. You can always see the crawl row or provider row behind a claim.
- Partial data is never reported as a zero. A capped, filtered, or sampled
  source says so, and it cannot support a definitive all-clear.
- Heuristics are labeled as heuristics. A convention or threshold is not
  presented as a search-engine rule.
- Each recommendation comes with a way to check that the fix worked, rather than
  a promise about rankings or traffic.

## Everyday use

`seo start` can save a project profile, which is a local shortcut for a site,
Search Console property, Google Analytics property, and brand terms. If you have one default
project, most commands need no flags.

```sh
seo report
seo refresh-priorities
seo quick-wins
seo second-page
seo technical-watch
```

Use `--project` when you have more than one:

```sh
seo report --project example
seo projects list
```

You can also work without a saved profile:

```sh
seo report --site sc-domain:example.com
seo report --url https://example.com
seo crawl https://example.com
seo audit-page --url https://example.com/pricing
```

`seo report --url` crawls the site and saves technical evidence. It does not
pretend to know traffic, queries, or rankings until you add a Search Console
property with `seo start`.

Run `seo help` for the short path or `seo help all` for the full command list.

Google Analytics commands sit under their provider namespace. List the properties available
to the connected account, then run a report with the property you need:

```sh
seo analytics google properties
seo analytics google report --property 123456789 --dimensions landingPage --metrics sessions,totalUsers
```

Bing Webmaster is optional. Connect it when you want Bing search and crawl
statistics beside your Google evidence:

```sh
seo providers bing connect
seo providers bing report --project example
```

The guided connection asks for the API key from Bing Webmaster Tools Settings,
then API Access. It validates the key, lists verified sites, matches one to the
selected project when the hostname is unambiguous, and stores the key in the
system keychain with a private local file fallback. Agents and CI can set
`SEO_BING_API_KEY` and run the report without saving the key.

The report keeps Bing traffic and crawl rows bounded and uncached. It labels
invalid, partial, capped, and unavailable provider evidence instead of turning
it into a zero. Bing's `inIndex` crawl statistic is provider evidence, not
URL-level proof that a page is indexed.

Use the same connection to review a bounded set of referring links, or import
an export from another source:

```sh
seo links --project example --json
seo links --file ./links.csv --row-limit 10000 --json
```

CSV and JSONL imports stream from disk. Regular JSON arrays have a smaller
file limit to avoid a memory spike. Every result includes the number of rows
read, rejected, deduplicated, omitted, or stopped by a limit. It is evidence
from the selected source, not a complete backlink index or an authority score.

## Analyze crawler traffic in server logs

Stream a local NGINX or Apache-style combined access log without importing or
retaining every raw request:

```sh
seo server-logs analyze --file ./access.log --json
seo server-logs analyze --file ./access.jsonl --format jsonl --json
```

The report groups observed search and AI crawler user agents by response class
and path. Input bytes, rows, line size, unique paths, and returned detail are
bounded, and any capped or malformed evidence stays visible. User-agent names
can be spoofed, so the result describes observed request strings rather than
verified crawler identity.

## Notify IndexNow after a change

Generate a key file in the public asset directory for your site, then deploy
it before sending notifications:

```sh
seo indexnow setup --site https://example.com --output ./public
seo indexnow verify --site https://example.com
seo indexnow submit --site https://example.com --url https://example.com/changed-page
```

Use `--dry-run --json` to validate a submission without notifying IndexNow.
The command accepts one URL, a comma-separated list, or a newline-delimited
file. A run is limited to 1,000 unique URLs, every URL must use the configured
host, and the public key file is checked before a live request. The local key
mapping stays in the system keychain with a private file fallback. Agents and
CI can set `SEO_INDEXNOW_KEY` for the current process instead.

An accepted IndexNow request confirms receipt only. It does not prove that a
URL was crawled, indexed, ranked, or shown in search results.

## Crawl a site

For a large or unfamiliar site, start with the sitemap health pass:

```sh
seo crawl --sitemap-url https://example.com/sitemap.xml --health --format pretty
```

This reads the sitemap, then checks each listed URL for status, redirects,
robots decisions, network failures, and access blocks. It does not parse or
render page bodies, join Google data, check external links, or write page and
robots responses to the local cache. Requests begin one at a time and increase
only after clean responses.

Run the full crawl second when the health evidence points to a problem, or when
you need metadata, canonicals, indexability, links, structured data, or page
content:

```sh
seo crawl https://example.com --format pretty
```

Save it, export it, or compare it with an earlier crawl:

```sh
seo crawl https://example.com --save
seo crawl https://example.com --format html --output report.html
seo crawl-reports
seo crawl-reports --compare latest --against previous
```

Useful crawl controls include `--max-pages`, `--max-depth`, `--include`,
`--exclude`, `--no-sitemap`, `--no-external`, and `--fail-on` for CI. Every
request uses the stable versioned identity
`SEO-Skill/<version> (+https://seoskill.dev)`.

If a site denies or challenges that identity, the report keeps the HTTP status,
provider indicators, request ID when available, and practical access guidance.
Do not allow requests based on User-Agent alone because it can be spoofed.
Scope any temporary exception to the audit machine source IP, required host or
paths, and the exact blocking rule.

## Use it in CI and scripts

JSON mode never prompts. Pass the site or project explicitly in unattended
runs.

```sh
seo report --project example --json
seo crawl --sitemap-url https://example.com/sitemap.xml --health --format junit --output sitemap-health.xml --fail-on high
seo crawl https://example.com --json --output crawl.json
```

Reports keep observed data, derived findings, skipped sections, limits, and
provider errors separate so automation can make decisions without parsing
terminal prose.

`seo report --json` returns a compact summary, action queue, and bounded crawl
evidence so an agent can choose its next call without loading every raw report.
Use `--full` only when a script needs the complete report object.

When a CI job needs Search Console or Google Analytics data, give it a Google service
account JSON key through its secret store. The service account needs access to
the exact properties it will query. This GitHub Actions step runs without a
browser or a copied local token:

```yaml
- name: Run the SEO report
  run: |
    npm i -g seo
    seo report --site sc-domain:example.com --json > seo-report.json
  env:
    SEO_GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.SEO_GOOGLE_SERVICE_ACCOUNT_JSON }}
```

The [Google data guide](https://seoskill.dev/docs/google) covers Search
Console and Google Analytics permissions, mounted secret files, and how to check the active
identity safely.

Agents can discover and run the same report catalog as MCP without starting a
server:

```sh
seo reports list --category crawl --json
seo reports describe audit-page --json
seo reports run audit-page --params '{"url":"https://example.com"}' --json
```

Always describe a report before constructing its parameters. The CLI and MCP
surfaces read from the same registry, so their ids and JSON Schemas cannot
drift.

## Use it with AI agents

Your agent carries one short SEO skill, and the CLI and MCP server do the
heavy lifting. The skill teaches an agent how to discover the 50+ audit and
report tools at runtime, and the agent asks the CLI for the detail on each
tool only when it is about to run it. You get the whole toolkit without fifty
skill files sitting in the context window on every session.

`seo start` offers to install the SEO skill during setup. If you skipped that
step or need to reinstall it later, run the packaged installer:

```sh
seo skill install
```

If you also skipped the MCP step, install the local server into a supported
client:

```sh
seo mcp install
```

The prompt detects installed clients. Scripts can choose one or more explicitly:

```sh
seo mcp install --codex
seo mcp install --claude-code
seo mcp install --cursor
seo mcp install --claude-desktop
```

Your client starts the server when it needs it. Run it directly only for manual
configuration or testing:

```sh
seo mcp serve
```

The repository ships one skill under `skills/seo`. It is a router: it teaches an
agent to discover reports, describe one to load its depth at runtime, inspect
the evidence, and request a smaller follow-up instead of loading a giant result
into context. Per-report guidance lives in the registry and is fetched with
`seo reports describe <id> --json`, so it never drifts from the skill.

The npm package includes the same file for local inspection:

```sh
seo skill list
seo skill path seo
```

Agents can also discover the canonical skill from
`https://seoskill.dev/.well-known/agent-skills/index.json`. The entry links to
the canonical skill instructions and includes a content digest for verification.

See [MCP and agents](https://seoskill.dev/docs/agents) for setup and tool
details.

## Use it as a library

Install the same unscoped package in any Node 22 or newer project:

```sh
npm install seo
```

Run any public report by id with the same definition, input schema, and
evidence used by the CLI and MCP server:

```ts
import { describeReport, executeReport } from 'seo/mcp'

const description = describeReport('quick-wins')
const result = await executeReport('quick-wins', {
  site: 'sc-domain:example.com',
  days: 90,
})

console.log(description.inputSchema)
console.log(result)
```

Or call typed analysis functions directly when your app already knows the job
it needs to run:

```ts
import { auditPage, crawlSite } from 'seo'

const page = await auditPage({
  url: 'https://example.com/pricing',
})

const health = await crawlSite({
  url: 'https://example.com',
  mode: 'sitemap',
  strategy: 'health',
  sitemapUrl: 'https://example.com/sitemap.xml',
})

const crawl = await crawlSite({
  url: 'https://example.com',
  maxPages: 100,
  maxDepth: 4,
})

console.log(page.issues)
console.log(health.summary, health.access)
console.log(crawl.summary, crawl.issueGroups)
```

The main `seo` export contains the report, provider, crawler, storage, and
rendering APIs. `seo/mcp` exposes report discovery, report execution, and the
embeddable MCP server. See the [TypeScript library
guide](https://seoskill.dev/docs/typescript) for structured error handling,
local Google access, and more examples.

## Local data and Google access

Google OAuth tokens use your system keychain when it is available. On a
headless machine or a locked keychain, the CLI falls back to a private
`0600` file in your user config directory. Project profiles, crawl reports, and
provider caches are also local. Use these commands to inspect or remove them:

```sh
seo privacy
seo doctor
seo auth logout
seo reset
```

`seo auth status` shows the active storage mode. Power users can choose it with
`seo auth storage --keychain` or `seo auth storage --file`.

Power users can bring their own Google OAuth client or use a service account in
CI. The [Google data guide](https://seoskill.dev/docs/google) covers both auth
paths, including OAuth testing-mode limits.

## Common questions

### Does my site data stay on my machine?

Yes. Reports, project profiles, Google tokens, crawls, and caches stay in your
local config directory. The CLI only makes the network requests needed to fetch
your site and call the Google APIs you connect.

SEO data never leaves your machine. The CLI sends anonymous usage events such
as the event name, report id, tool version, agent, OS, architecture, Node major,
and install week. It never sends URLs, identifiers, report data, or Google data.
Disable telemetry with `DO_NOT_TRACK=1` or `seo telemetry disable`. Read the
[full telemetry details](https://seoskill.dev/telemetry) and the
[public aggregate stats](https://seoskill.dev/stats).

### Do I need a Google API key?

No. `seo start` uses a normal Google sign-in for read-only Search Console and
Google Analytics access. Public releases can include a shared desktop OAuth client, and if
your build does not have one, setup helps you add your own. You can also run a
local technical crawl with no Google connection at all.

### What does it cost?

The `seo` package is free and open source under Apache-2.0. It calls Google APIs
you already have access to, so there is no separate subscription. Your own API
quotas still apply.

### How is this different from a paid SEO tool?

A hosted SEO tool keeps your data on its servers and shows you a dashboard. This
runs on your machine, works from your own crawl and Google data, and returns
structured evidence your agent can read and act on. Every finding shows the
evidence behind it and a way to verify a fix, so you are not trusting a score
you cannot inspect.

## Documentation

Questions, bug reports, and feature requests go through
[GitHub Issues](https://github.com/iannuttall/seo/issues). Report suspected
vulnerabilities privately through the process in [SECURITY.md](SECURITY.md).

- [Getting started](https://seoskill.dev/docs/getting-started)
- [CLI commands](https://seoskill.dev/docs/cli)
- [Crawler](https://seoskill.dev/docs/crawler)
- [Reports and data](https://seoskill.dev/docs/reports)
- [MCP and agents](https://seoskill.dev/docs/agents)
- [AI-search evidence](https://seoskill.dev/docs/ai-search)
- [Privacy policy](https://seoskill.dev/privacy)
- [Anonymous telemetry](https://seoskill.dev/telemetry)
- [Public usage stats](https://seoskill.dev/stats)
- [Terms of use](https://seoskill.dev/terms)
- [Security policy](https://seoskill.dev/security)
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

Contributor architecture and report-quality rules live in [AGENTS.md](AGENTS.md).

## License

The code is available under [Apache-2.0](LICENSE). Project names and artwork are
covered separately by the [trademark and brand policy](TRADEMARKS.md).
