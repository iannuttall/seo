# Getting started

`seo` is a local-first SEO tool. It runs on your machine, stores tokens locally, and gives you reports you can read or hand to an agent.

The fastest useful flow is:

```bash
seo start
seo report
seo refresh-priorities
seo technical-watch
```

## Install from source

The npm package name is not final yet, so source install is the honest path today.

```bash
git clone <repo-url>
cd seo
pnpm install
pnpm build
node packages/cli/dist/index.js start
```

If you link the CLI locally, the command becomes:

```bash
seo start
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

The crawler finds technical SEO issues, GEO gaps, broken links, duplicate metadata, indexability problems, schema gaps, weak internal links, and more.

If the project has a GSC property, it joins search metrics to the crawled pages. If the project has GA4, it joins landing-page sessions and conversions too.

## Save reports

```bash
seo crawl --project keep --save
seo crawl-reports
```

Saved reports let you ask follow-up questions without re-crawling. Agents can pull top fixes, affected URLs, and GEO gaps from the same report.

## Use JSON for scripts and agents

```bash
seo crawl --project keep --json --output crawl.json
seo report --project keep --json
```

JSON mode never prompts. Pass explicit `--project`, `--site`, `--url`, or `--property` values when scripting.
