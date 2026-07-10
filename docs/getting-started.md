# Getting started

`seo` is a local-first SEO tool. It runs on your machine, stores tokens locally, and gives you reports you can read or hand to an agent.

The fastest useful flow is:

```bash
seo start
seo report
seo refresh-priorities
seo technical-watch
```

## Install the CLI

Install the `seo` package globally, then start the guided setup:

```bash
npm install --global seo
seo start
```

To work on the source instead:

```bash
git clone https://github.com/iannuttall/seo.git
cd seo
pnpm install
pnpm build
node dist/cli.js start
```

## Connect Google

Run:

```bash
seo start
```

The setup flow asks for a project name, a Search Console property, a crawl URL, optional brand terms, and optional GA4 property. It saves those as a project profile.

Project profiles are just local shortcuts. They stop you from typing the same property IDs over and over.

## Run the main report

```bash
seo report --project keep
```

The report checks what data is available. If GSC, GA4, crawl, or monitoring data is missing, it skips that section and tells you what to run next.

## Run a crawl

```bash
seo crawl --project keep --max-pages 500 --format pretty
```

The crawler finds technical SEO issues, broken links, duplicate metadata,
indexability and snippet restrictions, schema gaps, weak internal links, and
separately labelled AI-search observations.

If the project has a GSC property, it joins search metrics to the crawled pages. If the project has GA4, it joins landing-page sessions and conversions too.

## Save reports

```bash
seo crawl --project keep --save
seo crawl-reports
seo crawl-reports --compare latest --against previous
```

Saved reports let you ask follow-up questions without re-crawling. Agents can pull top fixes, affected URLs, and AI Search eligibility blockers from the same report.

## Check one change, page, or performance issue

```bash
seo tests create --project keep --title "Update title tags" --scope page --target https://example.com/page --date 2026-06-01
seo tests report --project keep --id <test-id>
seo content optimize --project keep --url https://example.com/page
seo perf audit --project keep
```

The test workflow measures before and after periods from GSC and can add GA4 landing-page metrics when the project has a GA4 property. The content report uses real query demand for one URL. The performance audit uses local Lighthouse when available and falls back to a simple HTML response check when it is not.

## Use JSON for scripts and agents

```bash
seo crawl --project keep --json --output crawl.json
seo report --project keep --json
```

JSON mode never prompts. Pass explicit `--project`, `--site`, `--url`, or `--property` values when scripting.
