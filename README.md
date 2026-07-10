# seo

Local-first SEO and AI-search diagnostics for people and agents.

`seo` crawls your site, reads Search Console and GA4 when you connect them, and turns the mess into a short action list. Humans get plain English. Agents get stable JSON, saved reports, rule ids, evidence, and follow-up tools.

This is local first today. The same core is shaped so it can later run as a hosted API, remote MCP server, and paid product without rewriting the crawler.

## What it does

- Crawls sites for technical SEO and GEO issues.
- Checks 50 rules across metadata, links, indexability, canonicals, content, schema, performance, security, mobile, international, and social previews.
- Joins crawled URLs with GSC clicks, impressions, CTR, position, and top query data.
- Joins GA4 landing-page sessions and conversions when a project profile has a GA4 property.
- Ranks fixes by severity, affected URLs, search visibility, analytics value, and effort.
- Explains every issue in plain English: why it matters, how to fix it, and how to verify the fix.
- Saves reports locally so humans and agents can slice the same crawl without running it again.
- Compares saved crawl snapshots so agents can see exactly what changed.
- Records local SEO tests and measures before/after impact with GSC, optional GA4, and optional control groups.
- Builds content optimization reports from real search demand and crawled page content.
- Runs local performance audits with bundled Lighthouse, device-specific CrUX field data when configured, and an explicitly unscored transport fallback.
- Reports AI-search and entity evidence, reports optional llms.txt presence without treating it as an SEO factor, and builds OKF/site knowledge exports from the same saved crawl.
- Exposes the same workflows through CLI and MCP.

## Start here

From source:

```bash
git clone <repo-url>
cd seo
pnpm install
pnpm build
node packages/cli/dist/index.js start
```

If you already have a built checkout, the short path is:

```bash
seo start
seo report
seo crawl https://example.com --format pretty
```

The npm package name is not final yet. Once it is published, the intended install story is:

```bash
npm i -g <package-name>
seo start
```

Until then, use the built CLI from this repo or link it locally with your normal Node workflow.

## The human path

Most people should start with `seo start`. It connects Google, creates a project profile, and prints the next commands.

```bash
seo start
seo report --project keep
seo refresh-priorities --project keep
seo technical-watch --project keep
```

`seo report` is the main report. It checks what data is available, skips sparse sections clearly, and recommends useful follow-up commands instead of dumping every tool at once.

## The crawler path

Run a quick technical and AI-search readiness crawl:

```bash
seo crawl https://example.com --max-pages 500 --format pretty
```

Save a report for later:

```bash
seo crawl https://example.com --save --format html --output report.html
seo crawl-reports
seo crawl-reports --compare latest --against previous
```

Machine-readable output stays clean:

```bash
seo crawl https://example.com --json --output crawl.json
```

Use the saved crawl for AI and agent-readiness work:

```bash
seo crawl --project keep --save
seo ai-readiness --project keep
seo entity-readiness --project keep
seo llms audit --project keep
seo llms generate --project keep --output llms.txt
seo okf export --project keep --output ./okf
seo okf validate ./okf
seo okf explain ./okf
```

Useful flags:

| Flag | What it does |
| --- | --- |
| `--max-pages <n>` | Caps pages fetched. Defaults to 500. |
| `--max-depth <n>` | Caps click depth from the seed URL. |
| `--concurrency <n>` | Controls parallel page fetches. |
| `--include <pattern>` | Limits the crawl to matching URLs. |
| `--exclude <pattern>` | Skips matching URLs. |
| `--no-sitemap` | Does not seed from sitemap.xml. |
| `--no-robots` | Does not skip robots-blocked URLs. |
| `--no-external` | Skips external link checks. |
| `--site <property>` | Joins GSC page data. |
| `--ga4-property <id>` | Joins GA4 landing-page data. |
| `--format pretty,json,csv,html,markdown` | Chooses the output format. |
| `--fail-on high,medium,low` | Exits non-zero for CI gates. |

## The agent path

Install the MCP server into supported local clients:

```bash
seo mcp install
```

Run the server directly:

```bash
seo mcp serve
```

Agent tools include crawl, URL audit, rule explanation, top fixes, affected URLs, AI Search eligibility gaps, crawl reports, GSC/GA4 analysis, monitoring, pSEO, and workflow reports.

The crawler tools are compact by default. Full pages and full issues are opt-in so agents do not waste context on giant reports.

## Testing, content, and performance

These workflows use your own data. They are meant to be the local data layer an SEO or agent can reason over, without buying a keyword database or rank tracker.

Track a change:

```bash
seo tests create --project keep --title "Rewrite pricing page title" --scope page --target https://example.com/pricing --date 2026-06-01
seo tests report --project keep --id <test-id> --property 123456789
```

Use `--control-scope` and `--control-target` when you have a similar group of pages to compare against. The report stays plain English for humans and returns GSC/GA4 deltas in JSON for agents.

Build a content optimization report for one URL:

```bash
seo content optimize --project keep --url https://example.com/page
seo content optimize --project keep --url https://example.com/page --json
```

Audit performance:

```bash
seo perf audit --url https://example.com/page
seo perf audit --project keep --strategy desktop
```

`seo perf audit` uses its bundled Lighthouse with a compatible local Chrome installation. If the lab run is unavailable, it returns an unscored HTTP transport diagnostic and says what it could not measure. Set `SEO_CRUX_API_KEY` (preferred) or pass `--crux-key` when you want device-specific Chrome UX Report field data too.

## AI-search evidence

The crawler separates Google Search eligibility evidence from optional page and agent-protocol observations. It does not predict citations:

- structured data
- AI crawler access in robots.txt
- agent resource files such as OpenAPI, MCP, and agent descriptors
- semantic HTML
- authorship
- dates
- tables, lists, and other extractable blocks
- `/llms.txt`
- entity signals such as Organization, Person, Product, sameAs, and official social profiles

There are also focused AI-search support reports:

```bash
seo ai-readiness --project keep
seo entity-readiness --project keep
seo llms audit --project keep
seo seo-to-ai-query --project keep
seo ai-referrals --project keep
```

These do not claim to prove ChatGPT or Perplexity visibility. They help you turn real GSC demand into AI-monitoring prompts and find AI referral traffic in GA4. True AI answer visibility tracking is still a separate future layer.

## How this compares to Crawlie

Crawlie is a strong open-source crawler. This project goes wider.

| Area | Crawlie | seo |
| --- | --- | --- |
| Local CLI | Yes | Yes |
| MCP server | Yes | Yes |
| Technical SEO crawl | Yes | Yes |
| AI Search eligibility evidence | No | Yes |
| AI-search evidence report | No | Yes |
| llms.txt generator | No | Yes |
| Entity evidence report | No | Yes |
| OKF/site knowledge export | No | Yes |
| Rule guidance | Yes | Yes |
| Rule count | 46 | 50 |
| GSC joins | No | Yes |
| GA4 joins | No | Yes |
| URL Inspection | No | Yes |
| Crawl diffs | Roadmap | Yes |
| Local SEO tests | No | Yes |
| Content optimization reports | No | Yes |
| Lighthouse/Core Web Vitals layer | No | Yes |
| Link recovery | No | Yes |
| Search opportunity reports | No | Yes |
| pSEO/template analysis | No | Yes |
| AI referral report | No | Yes |
| Desktop app | Yes | Not planned yet |

The goal is to tell you which fixes are worth doing first.

## Docs

- [Getting started](docs/getting-started.md)
- [CLI commands](docs/cli.md)
- [Crawler](docs/crawler.md)
- [MCP and agents](docs/mcp.md)
- [GEO and AI search](docs/geo.md)
- [Release and packaging](docs/release.md)

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Useful smoke tests:

```bash
node packages/cli/dist/index.js help
node packages/cli/dist/index.js start --dry-run
node packages/cli/dist/index.js crawl --help
node packages/cli/dist/index.js mcp serve --test
```

## Auth

The CLI uses local Google OAuth tokens. Tokens stay on your machine.

For local auth testing, use one of these:

```bash
seo auth setup-client
SEO_GOOGLE_CLIENT_ID=...
SEO_GOOGLE_CLIENT_SECRET=...
```

Do not commit OAuth tokens, local config files, or provider credentials.

## Product status

The local CLI, crawler, report store, and MCP server are strong enough for real use. The public packaging is being prepared now.

Not built yet:

- hosted API
- remote authenticated MCP
- paid accounts
- AI answer visibility tracking
- public web dashboard
- macOS desktop app
