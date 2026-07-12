<p align="center">
  <img src="apps/web/public/favicon.svg" alt="SEO CLI" width="72" height="72">
</p>

<h1 align="center">SEO CLI</h1>

<p align="center">
  The SEO command for AI agents. Open source, evidence-backed SEO reports from your own crawl, Search Console, and GA4 data.
</p>

<p align="center">
  <a href="#quick-start">Get started</a>
  ·
  <a href="https://seoskills.dev/docs">Documentation</a>
  ·
  <a href="https://www.npmjs.com/package/seo">npm</a>
  ·
  <a href="https://github.com/iannuttall/seo/issues">Questions</a>
  ·
  <a href="https://seoskills.dev/privacy">Privacy</a>
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
- AI agents that need real crawl, Search Console, and GA4 evidence through MCP
  and packaged skills instead of screenshots or guesses.
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
optional GA4 property, and a local project profile. Public releases can include
the shared Google app. If it is unavailable in your build, setup guides you
through adding your own desktop OAuth client.

That is the normal path. The `seo` command is then available in every terminal,
script, CI job, and local MCP client on the machine.

The main report uses the evidence you have, explains what it could not check,
and recommends a short list of follow-up commands. You can start with a local
technical report before connecting Google.

Running `seo help` shows the shape of the tool:

```txt
seo v0.1.0

Human-friendly SEO reports first, power tools when you need them.

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
  seo skills list      List packaged skills for agents
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
Search Console property, GA4 property, and brand terms. If you have one default
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

## Crawl a site

Run a readable technical crawl, the base of any technical SEO audit:

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
`--exclude`, `--no-sitemap`, `--no-external`, and `--fail-on` for CI.

## Use it in CI and scripts

JSON mode never prompts. Pass the site or project explicitly in unattended
runs.

```sh
seo report --project example --json
seo crawl https://example.com --json --output crawl.json
seo crawl https://example.com --fail-on high --json
```

Reports keep observed data, derived findings, skipped sections, limits, and
provider errors separate so automation can make decisions without parsing
terminal prose.

`seo report --json` returns a compact summary, action queue, and bounded crawl
evidence so an agent can choose its next call without loading every raw report.
Use `--full` only when a script needs the complete report object.

When a CI job needs Search Console or GA4 data, give it a Google service
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

The [Google data guide](https://seoskills.dev/docs/google) covers Search
Console and GA4 permissions, mounted secret files, and how to check the active
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

Agents work best with both parts of the project. The `seo` package runs the
reports, and the SEO skill teaches an agent which report to choose, how to read
it, and what to verify before changing a site.

`seo start` offers to install the SEO skill during setup. In an agent-managed
environment, add it yourself with the standard installer:

```sh
npm i -g seo
npx skills add iannuttall/seo
```

Then install the local stdio MCP server into a supported client:

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
seo skills list
seo skills path seo
```

Agents can also discover the canonical skill from
`https://seoskills.dev/.well-known/agent-skills/index.json`. The entry links to
the canonical skill instructions and includes a content digest for verification.

See [MCP and agents](https://seoskills.dev/docs/agents) for setup and tool
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

const crawl = await crawlSite({
  url: 'https://example.com',
  maxPages: 100,
  maxDepth: 4,
})

console.log(page.issues)
console.log(crawl.summary, crawl.issueGroups)
```

The main `seo` export contains the report, provider, crawler, storage, and
rendering APIs. `seo/mcp` exposes report discovery, report execution, and the
embeddable MCP server. See the [TypeScript library
guide](https://seoskills.dev/docs/library) for structured error handling,
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

Power users can bring their own Google OAuth client. See
[getting started](https://seoskills.dev/docs/getting-started) for the available
auth paths.

## Common questions

### Does my site data stay on my machine?

Yes. Reports, project profiles, Google tokens, crawls, and caches stay in your
local config directory. The CLI only makes the network requests needed to fetch
your site and call the Google APIs you connect. There is no hosted backend,
account, or telemetry service.

### Do I need a Google API key?

No. `seo start` uses a normal Google sign-in for read-only Search Console and
GA4 access. Public releases can include a shared desktop OAuth client, and if
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

- [Getting started](https://seoskills.dev/docs/getting-started)
- [CLI commands](https://seoskills.dev/docs/cli)
- [Crawler](https://seoskills.dev/docs/crawler)
- [Reports and data](https://seoskills.dev/docs/reports)
- [MCP and agents](https://seoskills.dev/docs/agents)
- [AI-search evidence](https://seoskills.dev/docs/ai-search)
- [Privacy policy](https://seoskills.dev/privacy)
- [Terms of use](https://seoskills.dev/terms)
- [Security policy](https://seoskills.dev/security)
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
