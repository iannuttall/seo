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
seo crawl-reports --compare latest --against previous
seo rules
seo explain --rule robots_blocked
```

The crawler supports site, page, list, and sitemap modes. It respects robots.txt by default.

Saved crawl comparisons show pages and issues that are new, fixed, or changed. Use JSON mode when an agent needs exact page and rule deltas.

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
seo content optimize --project keep --url https://example.com/page
```

These commands use GSC data. Most exclude branded queries by default when brand terms are saved.

`content optimize` turns page-level GSC demand and fetched page content into a short brief. It suggests title, H1, meta description, section, and internal-link angles, then returns the source opportunity data for agents.

## Local SEO tests

```bash
seo tests list --project keep
seo tests create --project keep --title "Update title tags" --scope page --target https://example.com/page --date 2026-06-01
seo tests report --project keep --id <test-id>
seo tests report --project keep --id <test-id> --property 123456789 --control-scope group --control-target /blog/
```

Use tests when you changed titles, content, templates, internal links, schema, or site sections and want a before/after read from your own data.

The GSC side works for page, query, group, and site changes. GA4 metrics are attached when the test maps to landing pages. Query-only tests stay GSC-only because GA4 does not have query data.

## Performance

```bash
seo perf audit --url https://example.com/page
seo perf audit --project keep
seo perf audit --project keep --strategy desktop --crux-key <key>
```

`perf audit` uses local Lighthouse when it is available. If Lighthouse is missing, it runs a lightweight HTML response audit so the command still gives a useful result instead of failing.

CrUX field data is optional. Pass `--crux-key` or set `SEO_CRUX_API_KEY` when you want field Core Web Vitals from Google.

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

`ai-readiness` returns crawl and technical evidence from a saved crawl without inventing an aggregate score. It reports paragraph shape, structured data, entity signals, agent resource files, and llms.txt as contextual observations rather than ranking or citation factors.

`entity-readiness` returns observed schema types, entity-scoped `sameAs` links, unclassified social links, authors, dates, titles, and H1 coverage. It does not turn those signals into a ranking or machine-understanding score.

`llms audit` reports whether optional `/llms.txt` exists and whether the crawl has enough candidate pages to generate one. Missing llms.txt is not an SEO issue. `llms generate` drafts a focused file for services that explicitly consume it.

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
