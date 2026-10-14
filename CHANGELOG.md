# Changelog

## 0.3.0

Version 0.3.0 narrows SEO Skill to first-party data: your own Search Console,
Google Analytics and Clicky (or other analytics) data, with Google update
dates laid over it, plus keyword data from your own DataForSEO or Ahrefs key.
The results are facts. Your agent shows you what matters and asks before it
changes a page.

### New

- **Eight commands.** `seo report`, `seo page --url`, `seo compare --date`,
  `seo index`, `seo research <action>`, `seo data`, `seo crawl` and
  `seo internal-links` replace most of the old report commands. `seo start`
  is still the first thing to run.
- **One main report with sections.** Run `seo report` without a section
  first. It shows the overview and every section's count and top rows. Then
  run one section with `--section`: `overview`, `quick-wins`, `low-ctr`,
  `striking-distance`, `second-page`, `content-decay`, `cannibalization` or
  `traffic-drop`.
- **Live page checks.** Page sections check their top 20 URLs live and merge
  same-site redirects into their targets. `seo page` adds Google's index
  status from URL Inspection.
- **Google updates in the window.** `seo compare` and the `traffic-drop`
  section list the Google updates whose dates overlap. Overlap is timing, not
  cause.
- **Research from your own key.** `seo research` returns keyword metrics,
  ranked keywords, SERPs, competitors and backlinks from DataForSEO or
  Ahrefs. Rows with a domain get a free Domain Rating column, credited
  "Domain Rating by Ahrefs".
- **One way to run.** Each command takes a target and an optional date
  window. Brand terms, minimum impressions and the comparison period are set
  automatically and shown in the output. More detail comes from
  `--detail rows` with `--offset`, or `--detail full`.
- **Hosted MCP server.** A free remote server at `https://seoskill.dev/mcp`.
  Sign in with Google; nothing is stored. Provider keys are sealed into the
  token your client keeps, or sent as headers. Connect with
  `claude mcp add --transport http seoskill https://seoskill.dev/mcp` or
  `codex mcp add seoskill --url https://seoskill.dev/mcp`.
- **Shared MCP tools.** The hosted server and the local server
  (`seo mcp serve`) expose the same tools: `seo_sites`, `seo_report`,
  `seo_page`, `seo_compare`, `seo_index`, `seo_research` and `seo_data`. The
  local server adds `seo_crawl` and `seo_internal_links`. The provider
  package tools (`seo_list_providers`, `seo_describe_provider`,
  `seo_run_provider`) are unchanged.

### Changed

- The MCP tools `seo_list_reports`, `seo_describe_report` and
  `seo_run_report` are gone. Agents call the command tools above directly.
- The skill now teaches the eight commands and the one-report flow instead of
  list, describe and run.
- `seo reports list`, `seo reports describe` and `seo reports run` still work
  for the remaining report catalog.
- Quick wins and low CTR minimums now scale to the site, and brand terms, the
  CTR curve and likely automated query flags were tightened.

### Moved

Old 0.2 command names still run in 0.3.0. Each one prints its new command.
**They stop working in 0.4.0.**

| Old command | New command |
| --- | --- |
| `seo diagnose-property` | `seo report` |
| `seo refresh-priorities` | `seo report` |
| `seo query-cluster` | `seo report` |
| `seo quick-wins` | `seo report --section quick-wins` |
| `seo ctr-underperformers` | `seo report --section low-ctr` |
| `seo striking-distance` | `seo report --section striking-distance` |
| `seo second-page` | `seo report --section second-page` |
| `seo decaying` | `seo report --section content-decay` |
| `seo cannibal` | `seo report --section cannibalization` |
| `seo traffic-anomaly` | `seo report --section traffic-drop` |
| `seo page-opportunities` | `seo page --url <url>` |
| `seo audit-page` | `seo page --url <url>` |
| `seo url-inspect` | `seo page --url <url>` |
| `seo segment-impact` | `seo compare --date <date>` |
| `seo update-correlate` | `seo compare --date <date>` |
| `seo update-postmortem` | `seo compare --date <date>` |
| `seo link-recover` | `seo index` |
| `seo gsc-query` | `seo data` |
| `seo links` | `seo research backlinks --target <domain>` |

### Removed

These reports were removed. A removed command prints a removal message and
stops.

- Rank tracking
- Programmatic SEO (`seo pseo`)
- AI, GEO and AEO readiness (`seo ai-readiness`, `seo agent-readiness`,
  `seo entity-readiness`, `seo seo-to-ai-query`, `seo community-intent`)
- llms.txt and OKF (`seo llms`, `seo okf`)
- Bing Webmaster
- Local search demand
- Server logs (`seo server-logs`)
- Monthly and narrative reports (`seo monthly-report`, `seo report-narrative`)
- Semrush as a research provider. Its terms do not allow its data as input
  to an AI model, so `seo research` uses DataForSEO or Ahrefs only.
