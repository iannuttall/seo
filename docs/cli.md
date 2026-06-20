# CLI commands

The CLI has a calm human path and a deeper agent path.

Most people should use:

```bash
seo start
seo report
seo refresh-priorities
seo quick-wins
seo second-page
seo technical-watch
```

Agents and scripts should pass `--json` and explicit selectors.

## Start and projects

```bash
seo start
seo projects list
seo projects add
seo projects show --id keep
seo doctor
```

Use `--project` for saved profiles. `--client` still works as a legacy alias, but new docs should use `--project`.

## Main reports

```bash
seo report --project keep
seo report --site sc-domain:example.com
seo report --project keep --json
```

`seo report` is the main human report. It runs first, explains sparse data, and recommends follow-up commands.

## Technical crawler

```bash
seo crawl https://example.com
seo crawl --project keep --max-pages 500
seo crawl --project keep --format html --output report.html
seo crawl --project keep --json --output crawl.json
seo crawl-reports
seo crawl-reports --id <report-id>
seo rules
seo explain --rule geo_no_structured_data
```

The crawler supports site, page, list, and sitemap modes. It respects robots.txt by default.

## Search opportunities

```bash
seo quick-wins --project keep
seo second-page --project keep
seo decaying --project keep
seo cannibal --project keep
seo ctr-underperformers --project keep
seo internal-links --project keep --url https://example.com/page
seo query-cluster --project keep
seo page-opportunities --project keep --url https://example.com/page
```

These commands use GSC data. Most exclude branded queries by default when brand terms are saved.

## AI-search helpers

```bash
seo ai-readiness --project keep
seo entity-readiness --project keep
seo llms audit --project keep
seo llms generate --project keep --output llms.txt
seo okf export --project keep --output ./okf
seo okf validate ./okf
seo okf explain ./okf
seo export knowledge --project keep --format okf --output ./okf
seo export knowledge --project keep --format markdown --output knowledge.md
seo export knowledge --project keep --format json --output knowledge.json
seo seo-to-ai-query --project keep
seo ai-referrals --project keep
```

`ai-readiness` scores bot access, llms.txt, machine-readable structure, direct-answer content, entity signals, technical UX, and crawl completeness from a saved crawl.

`entity-readiness` focuses on whether agents can connect the site to the right brand, people, products, and official profiles.

`llms audit` checks whether `/llms.txt` exists and whether the crawl has enough good candidate pages. `llms generate` drafts a focused file from the saved crawl.

`okf` exports a directory of Markdown files that follows the OKF bundle shape. `export knowledge` is the generic alias when you want OKF, Markdown, or JSON from the same saved crawl.

`seo-to-ai-query` turns real search demand into prompts worth monitoring in AI engines.

`ai-referrals` scans GA4 for known AI referral sources. It is useful, but it will miss visits that arrive as direct or unassigned traffic.

## Monitoring

```bash
seo technical-watch --project keep
seo crawl-diff --project keep
seo index-watch --project keep
seo link-recover --project keep
seo redirect-trace --url https://example.com/old
seo schedule cron --project keep
```

Monitoring commands are designed for repeat runs. They save enough history to spot changes, not only one-off issues.

## Raw data tools

```bash
seo gsc-query --site sc-domain:example.com --dimensions query,page
seo url-inspect --site sc-domain:example.com --url https://example.com/page
seo ga4-report --property 123456789 --dimensions landingPage --metrics sessions,totalUsers
seo updates
```

Use these when you want raw API-shaped data.
