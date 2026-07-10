<p align="center">
  <img src="apps/web/public/favicon.svg" alt="SEO Skills CLI" width="72" height="72">
</p>

<h1 align="center">SEO Skills CLI</h1>

<p align="center">
  Technical SEO skills for AI agents and developers. Crawl sites, connect search data, and turn local evidence into prioritised fixes.
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

`seo` finds technical problems, ties them to the pages and queries they affect,
and shows what is worth fixing first. The reports run on your machine and keep
their supporting evidence close by, so you can act without guessing.

## Quick start

Requires Node 22 or newer.

Run the guided setup without installing anything globally:

```sh
npx seo start
npx seo report
```

Or install the command once:

```sh
npm i -g seo
seo start
seo report
```

The setup walks you through Google sign-in, your Search Console property, an
optional GA4 property, and a local project profile. Public releases can include
the shared Google app. If it is unavailable in your build, setup guides you
through adding your own desktop OAuth client.

That is the normal human path. Examples below use the global `seo` command. If
you prefer not to install it, prefix the same commands with `npx`.

The main report uses whatever evidence is available,
explains anything it could not check, and recommends a short list of follow-up
commands.

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
seo crawl https://example.com
seo audit-page --url https://example.com/pricing
```

Run `seo help` for the short path or `seo help all` for the full command list.

## Crawl a site

Run a readable technical crawl:

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

## Use it with AI agents

Install the local stdio MCP server into a supported client:

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

The package also ships focused skills under `skills/`. They teach agents when
to discover reports, run an analysis, inspect evidence, and request a smaller
follow-up instead of loading a giant report into context.

List or install them without finding the npm package directory yourself:

```sh
seo skills list
seo skills install --target codex
seo skills install --target claude
seo skills install --target project
```

Agents can also discover the complete skill catalog from
`https://seoskills.dev/.well-known/agent-skills/index.json`. Each entry links to
the canonical skill instructions and includes a content digest for verification.

See [MCP and agents](https://seoskills.dev/docs/agents) for setup and tool
details.

## Use it as a library

Install the same unscoped package in any Node 22 or newer project:

```sh
npm install seo
```

```ts
import { auditPage, crawlSite } from 'seo'
import { createServer } from 'seo/mcp'
```

The main `seo` export contains the report, provider, crawler, storage, and
rendering APIs. `seo/mcp` exposes the stdio MCP server.

## Local data and Google access

Google OAuth tokens and project profiles are stored in your user config
directory with private file permissions. Crawl reports and provider caches are
also local. Use these commands to inspect or remove them:

```sh
seo privacy
seo doctor
seo auth logout
seo reset
```

Power users can bring their own Google OAuth client. See
[getting started](https://seoskills.dev/docs/getting-started) for the available
auth paths.

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
