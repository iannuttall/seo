# Changelog

## 0.3.0-beta.3 (unreleased)

### New

- **Bing Webmaster Tools is back.** In the CLI and local MCP server, save a
  Bing Webmaster API key with `seo providers bing connect`, or set
  `SEO_BING_API_KEY` for agents and CI. `seo providers bing status` and
  `seo providers bing disconnect` show and remove it. On the hosted server,
  connect Bing on your account page with Bing's own read-only sign-in.
- **Google and Bing side by side.** The `seo report` overview adds a line
  with Google and Bing clicks and impressions for the same dates, and each
  engine's share of those clicks. When Bing is not connected, it says how to
  connect it. The numbers are never added together.
- **A `bing` report section.** It lists Bing's top queries and pages with
  Google's clicks, impressions and position for the same rows beside them.
  Bing lists only its top rows by week, so a row missing from Bing's list is
  unknown, not zero.
- **Raw Bing rows.** `seo data --source bing` and `seo_data` with source
  `bing` return Bing query or page rows with the previous period.
- **Bing sites in `seo_sites`.** It shows the Bing site for each property and
  any Bing sites with no Search Console property.
- **Hosted account page.** `https://seoskill.dev/account` lists your linked
  Google accounts and lets you add another, connect Bing, save or remove
  DataForSEO and Ahrefs keys, delete everything, or sign out. Your first
  Google sign-in is your account. There is no password.
- **More than one Google account.** On the hosted server, each request uses
  the linked account that can read the site. `seo_sites` lists properties
  from every linked account, and an access error names the linked accounts
  and links to the account page.

### Changed

- The hosted server now keeps a small encrypted store: your person id, your
  linked Google and Bing sign-ins, and any DataForSEO or Ahrefs keys you
  save. It keeps no report data, no Search Console, analytics or Bing rows,
  no site lists and no request logs. Delete everything on the account page,
  or revoke SEO Skill in your Google account.
- Hosted keys are saved on the account page instead of the sign-in page.
  Key headers still work, win over saved keys, and are used for that request
  only.
- Existing hosted connections must sign in with Google once more.
- Bing links and IndexNow stay removed.

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
- `seo schedule cron` prints the technical watch line only. Project profiles
  no longer keep a monthly report day or a Bing site.
- Crawl JSON no longer has `config.checkAgentDiscovery` or `agentDiscovery`.
  Comparing a crawl saved before this change with a new one asks for review
  once, because the crawl settings changed.

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

### Removed

These were removed. A removed command or report id prints a removal message,
names the command to use instead when there is one, and stops.

- Rank tracking and saved keyword sets (`seo projects keyword-sets`)
- Programmatic SEO (`seo pseo`, `seo export pseo`)
- AI, GEO and AEO readiness (`seo ai-readiness`, `seo agent-readiness`,
  `seo entity-readiness`, `seo seo-to-ai-query`, `seo community-intent`,
  `seo export knowledge`)
- llms.txt and OKF (`seo llms`, `seo okf`). The free llms.txt checker on the
  website still works.
- AI prompt observations and AI mention research
- Local search demand
- Server logs (`seo server-logs`). The free log file analyzer on the website
  still works.
- Monthly and narrative reports (`seo monthly-report`, `seo report-narrative`,
  `seo export monthly`, `seo export narrative`)
- The old research reports: `keyword-research`, `keyword-metrics`,
  `keyword-opportunities`, `competitive-opportunities`,
  `competitor-keyword-gap`, `domain-overview`, `ranked-keywords`,
  `ranking-pages`, `serp-competitors`, `serp-results`, `domain-rating` and
  `link-evidence`. Use `seo research <action>` instead.
- `seo links`. Use `seo research backlinks --target <domain>` instead.
- Semrush (`seo providers semrush`). Its terms do not allow its data as input
  to an AI model, so `seo research` uses DataForSEO or Ahrefs only. Research
  file imports accept DataForSEO and Ahrefs exports only.
- The SerpBase stub
- Bing Webmaster (`seo providers bing`)
- IndexNow (`seo indexnow`)
- `seo reports describe --check`, which only covered agent readiness checks
- Local spend limits and records (the `limits` and `spend` provider
  commands). Set spend limits in your provider account.

`seo reset` still deletes Semrush, SerpBase, Bing and IndexNow keys that an
older version saved.
