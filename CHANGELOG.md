# Changelog

## 0.12.1

### Fixed

- URL Inspection no longer fails with "database is locked" when another
  `seo` run holds the local cache. The inspection goes ahead uncounted and
  Google's own daily limit applies, as it already did for the rest of the
  cache.

### Security

- `seo` now needs Node 22.23.4, 24.22.1, 26.12.1 or a later release of the
  same line, the versions with the Node.js security fixes of 21 October
  2026, and installs undici 8.12.2 or later for its fixes of 15 October 2026.

## 0.12.0

### Added

- `seo index` explains Google's page indexing reasons. Search Console's
  Page indexing report has no API, so it inspects known URLs in a fixed
  order (pages that lost clicks, Search Console pages by clicks then
  impressions, sitemap URLs, then the rest), 100 a run by default, and says
  how many it inspected out of how many it knows and what stopped it. In
  the CLI and the local MCP, `--max-urls` (`max_urls`) inspects more, up to
  the URL Inspection quota left today. There, each URL Inspection result is
  saved in the local cache for 7 days and reused: paging rows, `--detail
  full` or a larger `--max-urls` inspects only URLs that are missing or
  older, and the result says how many came from saved results and how old
  the oldest is. `--refresh` asks Google again. `seo cache clear --provider
  gsc` removes them.
  Rows are grouped by Google's exact reason and sorted by reason then URL,
  so a weekly result can be compared with the last one. Each URL shows its
  live status and redirects (permanent or temporary, followed to the final
  URL), the declared and Google canonicals, referring URLs, whether the
  sitemap lists it and the last crawl, with a label (fix, check, expected
  or indexed) and the evidence for it. It takes `--detail` and `--offset`
  like the other commands, and runs the same in the CLI, the local MCP and
  the hosted MCP.
- `seo page` follows redirects to the final URL, shows Google's reason with
  its label, and adds the fetch state, robots.txt state, crawler, referring
  URLs and sitemaps from URL Inspection.

## 0.11.0

### Added

- When a newer `seo` is out, results end with one line saying so and how
  to update: `npm i -g seo` for a global install, or `npx -y seo@latest`
  when it runs through npx (in an MCP config, use `seo@latest` and restart
  the client). It shows in terminal output (on stderr), as `updateNotice`
  in JSON and in every local MCP tool result. The version check runs in the
  background at most once a day and never slows a run.
  `NO_UPDATE_NOTIFIER=1` or `--no-update-notifier` turns it off, and it
  stays off in CI.

### Fixed

- A busy or unusable local cache no longer fails a report. When another
  run holds the cache, the report finishes with a temporary cache instead
  of failing with "database is locked".
- The local MCP server records the real reason a tool failed (not signed
  in, no key saved, no access, provider error) in usage counts, instead of
  "unknown".

## 0.10.0

### Changed

- `seo internal-links` audits a whole site with `--site`, or finds links to
  one page with `--url`. It crawls the site from your machine (sitemap
  first, robots.txt and its crawl delay honoured, redirects and canonicals
  followed), finds related pages by their text and by shared Search Console
  queries when the property is available, and places each link in a real
  sentence with a real phrase as anchor text. At most 8 links per target.
  A site audit crawls 500 pages; `--max-pages` takes up to 5,000, and the
  result says how many pages were crawled and whether the limit was hit.
  The JSON shape is new (methodology replaced by `crawl`, `judge`,
  `searchConsole`, `items`, `heldBack` and `pageInventory`).
- With a TypeSafe key, Jev classifies every page's type and search intent
  and judges each link: its probability, the sentence, the anchor and what
  it does for the reader. Fixed floors in code can overrule it. Set
  `TYPESAFE_API_KEY` on the machine, or save the key on the Keys tab of the
  seoskill.dev account and run `seo login`. The result shows the requests
  and their cost (about 10 to 20 cents for 500 pages). Without a key it
  says Jev was not used and uses text heuristics.

## 0.9.0

### Added

- `seo research ai_answers --target <site>` checks whether AI answers cite
  or name the site. It takes the top 10 askable questions from the site's
  own `ai-queries` section (last 90 days) and asks each one on ChatGPT
  search, Google AI Mode and the Google AI Overview, through your
  DataForSEO account. Each row is cited, mentioned, neither, no answer or
  unavailable, with the date, the cost and the model DataForSEO reports.
  It costs about $0.12 a run.

### Changed

- The `ai-queries` section leaves out letters split by spaces, text broken
  by a wrong encoding and text pasted from a tool or an agent's output, and
  counts what it left out. Each question has an `askable` flag, and
  `ai_answers` checks only askable questions.
- Every DataForSEO `seo research` result shows DataForSEO's own cost, in
  the text and as `costUsd` in JSON.

### Fixed

- DataForSEO's "No Search Results" is an empty result with its cost, not
  an error. Partial results keep their rows and are labelled partial.
- `ai_answers` checks the country and language against DataForSEO's free
  lists before any paid call, so an unsupported market costs nothing.

## 0.8.3

### Added

- The Google Analytics part of `seo report` and `seo compare` shows Organic
  Search sessions by search engine, such as Google, Bing, Yahoo and
  DuckDuckGo. It works on the hosted MCP too, so sites that get most of
  their search visits from Bing can see it there.
- When Bing sends more clicks than Google, the report overview in the CLI
  and local MCP adds Bing's own overview: totals against the previous
  period, and the pages and queries that gained or lost the most Bing
  clicks. Pages and queries that left Bing's top list are listed as unknown,
  not zero.
- `seo report --site <site>` runs a Bing report for a site that is in your
  Bing account but has no Search Console property.

## 0.8.2

### Added

- `seo report` has a new `ai-queries` section: Search Console queries that
  look like AI conversations and agent searches (replies such as "yes",
  follow-ups such as "what about…", agent prompts, `site:` searches and long
  chat-style questions), with rewordings grouped into one question and its
  top page. It is a heuristic over the last 90 days.
- The hosted MCP notes how each new person signed up, once: the path (MCP
  client, account page or `seo login`), the MCP client's name or the agent
  running the CLI, and, from a first-visit cookie on seoskill.dev, the
  referring site's host, the landing page and any `utm_*` tags. No IP
  address, country or email. The privacy and cookie policies list it.
  `seo login` now sends the agent it runs in (when usage counts are on) and
  a `seo/<version>` user agent.

### Changed

- `seo start` now asks how you want to sign in: sign in to your free
  seoskill.dev account or create one (recommended, so the CLI and the hosted
  MCP share your Google accounts, Bing and keys), sign in with Google on this
  machine only, or skip. A machine already linked with `seo login` skips the
  question.

## 0.8.1

### Added

- The Google Analytics part of `seo report` and `seo compare` now shows
  visits from AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot
  and others) by source, with their top landing pages, for both periods.

### Changed

- Results no longer end with "only edit pages with their approval", and the
  MCP instructions no longer tell the agent how to work with the person. The
  skill already dropped these rules in 0.8.0.

## 0.8.0

### Changed

- The skill is now a short map of the commands and MCP tools (about 250
  words, down from about 1,000). It no longer sets rules for how the agent
  works, such as asking before each edit. Each result already states its
  limits and the command to run next.
- "Not signed in" now says that `seo crawl --url` works without sign-in.
- `seo analytics google report --property <id>` and
  `seo analytics clicky report --site <site>` are the CLI way to read your
  analytics. Each returns the same landing pages as the MCP tool, with dates
  and `--detail` like the other commands. The Google report no longer takes
  `--dimensions`, `--metrics`, `--limit` or `--body`.

### Added

- `seo report` (overview) and `seo compare` show Google Analytics sessions
  for the same dates: Organic Search from Google, from every search engine,
  and from all channels. The property is the one whose web stream matches the
  site, and the output names it. When none matches, the report says so.
- `seo crawl` checks what AI agents can read: AI search and training bots
  in robots.txt (listed apart), Markdown copies of public pages, llms.txt and
  its links, agent files under `/.well-known/`, and the `Content-Signal` and
  `Link` headers. It reports a page that needs a sign-in and still links to
  a Markdown copy. A file that could not be fetched is reported as unknown,
  not missing.

## 0.7.1

### Fixed

- `seo research` with DataForSEO now works outside English-speaking
  countries. Each country gets its own language (Spanish for Mexico, German
  for Germany), and the result names it. Before, every request asked for
  English, and DataForSEO refused countries without English data.

## 0.7.0

### New

- **`seo internal-links` shows where each link fits.** Each suggested source
  page names up to two sentences that already talk about the target, with
  anchor text taken from those sentences.
- **`seo page` returns the page's main content as Markdown** with
  `--detail full` (MCP `seo_page`, detail `full`), up to 20,000 characters.
  CLI and local MCP server only.
- **Build your own data source** from the new
  [provider template](https://github.com/iannuttall/seo-provider-template).
  There will be no more built-in sources.

### Changed

- `seo internal-links` takes only `--url` and optional dates. It sets its own
  limits (last 90 days, up to 40 pages checked, 20 returned) and brand terms,
  and shows them in the result. The old flags stop with a notice.
- `seo analytics clicky connect` checks the sitekey itself and no longer
  installs the Clicky provider package. `seo analytics clicky report` is now
  `seo data --source clicky`.

### Fixed

- Pages whose HTML has no `<html>` element no longer crash page reading,
  `seo page` or `seo internal-links`.

## 0.6.0

### New

- **Clicky with your seoskill.dev account.** Save your whole Clicky account,
  or one site at a time, on the account page. `seo data --source clicky
  --site example.com` reads it after `seo login`, with visits by landing
  page, traffic sources and search engines. A site you add to Clicky later
  appears the first time you ask for it.
- **`seo index` counts index states.** It also checks the home page, and
  says when most checked pages are out of Google's index but the home page
  is in, which points to the whole site rather than single pages.

### Changed

- Old 0.2 report names still work and print their new command. They, and
  the commands under "More commands" in `seo help all`, are removed in
  1.0.0.

## 0.5.0

### New

- **`seo login` links the CLI to your seoskill.dev account.** Your Google
  accounts, Bing and research keys then live in one place, and every machine
  you link uses them. The CLI gets short-lived tokens from the account and
  makes the Google and Bing requests itself, so Bing works with an account
  even though Bing blocks the hosted server. `seo logout` unlinks a machine.
- In a terminal, `seo login` opens the approval page and waits. An agent or
  script gets the link, shows it to you, and runs `seo login` again after
  you approve it.
- Cloud agents can use a token from the account page as `SEO_TOKEN`.
- The account page lists linked machines, approves a `seo login`, makes
  cloud agent tokens and connects Bing again.
- Sharing images on seoskill.dev are drawn at build time.

### Changed

- The hosted MCP sends agents to `npx -y seo login` for Bing, crawls and
  internal links, and the research tool no longer teaches key headers.

## 0.4.2

- The MCP Registry name is now `dev.seoskill/seo`, under the seoskill.dev
  domain. It was `io.github.iannuttall/seo`. Nothing else changed.

## 0.4.1

Replaces 0.4.0 and 0.3.0, which were removed from npm. Same features.

### Fixed

- The `bing` section says why it has no data: Bing has no data for the
  site yet, the site is not verified, or it is not in the Bing account.
- `seo data --source bing` and the `bing` section run without a Google
  sign-in.
- Research `competitors` leaves out the target and 12 large platforms such
  as YouTube and Reddit, and says how many rows it left out.
- Live page checks note same-site 302 and 307 redirects as temporary.
- `traffic-drop`: one spike day before a drop no longer hides the drop.

## 0.4.0

SEO Skill is now only the data layer. Each command fetches your data and
returns it, and nothing is saved between runs. Your agent decides what to
keep and what to log.

To stay on the old version, run `npm i -g seo@0.2.41`. It stays available.

### Fixed

- The `traffic-drop` section finds a sudden, lasting change at its real
  start date. Before, it compared only the last 7 days, so a drop that
  started earlier could show as normal and an unrelated Google update could
  look like it overlapped.

### New

- Both MCP servers serve the skill as the resource `skill://seo/SKILL.md`.
- On the hosted server, a missing key or Google account error tells the
  agent to open the right part of the account page and try again.
- When a report has no Bing data, it says the totals are Google only.

### Changed

- **`seo start` asks less.** It signs you in with Google, offers to add an
  MCP server to the agents it finds, and offers to install the skill. The
  free hosted server at `https://seoskill.dev/mcp` is the first choice;
  the local server is the other. Claude Code and Cursor get a `seoskill` URL
  entry, and Codex gets one through `codex mcp add`. Claude Desktop takes
  remote servers only from its Connectors settings, so it gets the local
  server and a note on how to add the hosted one. Setup then prints
  `seo sites` and `seo report --site <site>`.
- **Every command takes `--site` or `--url`.** `--site` takes a domain, a URL
  or a `sc-domain:` property. A command run without one stops and says to
  pass `--site` and run `seo sites`. Google Analytics commands take the
  numeric `--property`, which `seo analytics google properties` lists.
  Clicky commands take `--site-id`.
- `seo index-coverage` runs its own crawl instead of reading a saved one.
  `--url` sets the start page.
- An existing `config.json` keeps its old saved projects. They are ignored,
  not deleted. `seo reset` still deletes everything.

### Removed

- **Saved project profiles.** `seo projects`, `seo project` and `seo client`
  are gone. `--project` and `--client` on any command stop with a note to
  pass `--site` instead.
- **`seo start` options** that only served projects: `--id`, `--name`,
  `--site`, `--search-console-account`, `--url`, `--urls`,
  `--google-analytics-property`, `--google-analytics-account`,
  `--clicky-site-id`, `--brand`, `--weekday`, `--default`, `--skip-profile`,
  `--skip-auth`, `--skip-mcp`, `--skip-skill` and `--refresh`. It keeps
  `--json` and `--dry-run`.
- **Commands that saved history or decisions.** Each one stops with a note
  that names what to use instead:

  | Removed | Use instead |
  | --- | --- |
  | `seo change-log` | Your agent's own notes |
  | `seo tests` | `seo compare --date <date>` |
  | `seo content-groups` | Your agent's own notes |
  | `seo monitoring` | `seo crawl` |
  | `seo schedule` | Your agent's scheduler |
  | `seo index-watch` | `seo page --url <url>` |
  | `seo technical-watch` | `seo crawl` |
  | `seo crawl-reports` | `seo crawl` |
  | `seo crawl-diff` | `seo crawl` |
  | `seo diagnose` | `seo report` |
  | `seo diagnose-property` | `seo report` |
  | `seo export diagnose` | `seo report --json` |

- `seo crawl --save` and saved crawl history. A crawl returns its full
  result; add `--json --output <file>` to write it to a file.
- The report catalog ids `measure-change`, `technical-watch`, `crawl-diff`,
  `index-watch`, `index-monitor`, `index-coverage-plan`, `compare-crawls`,
  `crawl-history`, `crawl-report` and `affected-urls`.
- `seo analytics google properties --save` and the saved default Google
  Analytics property, `seo analytics clicky detach`, and the
  `--ignore-change-log` flag.

## 0.3.0

Version 0.3.0 narrows SEO Skill to first-party data: your own Search Console,
Google Analytics and Clicky (or other analytics) data, with Google update
dates laid over it, plus keyword data from your own DataForSEO or Ahrefs key.
The results are facts. Your agent shows you what matters and asks before it
changes a page.

To stay on the old version, run `npm i -g seo@0.2.41`.

### New since 0.3.0-beta.2

- **Bing Webmaster Tools is back in the CLI and local MCP server.** Save a
  Bing Webmaster API key with `seo providers bing connect`, or set
  `SEO_BING_API_KEY` for agents and CI. `seo providers bing status` and
  `seo providers bing disconnect` show and remove it. The hosted server shows
  no Bing for now. When an agent asks it for Bing, it names the CLI command
  to run instead.
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
- **Bing sites in `seo_sites`.** On the local MCP server, it shows the Bing
  site for each property and any Bing sites with no Search Console property.
- **Hosted account page.** `https://seoskill.dev/account` lists your linked
  Google accounts and lets you add another, save or remove
  DataForSEO and Ahrefs keys, delete everything, or sign out. Your first
  Google sign-in is your account. There is no password.
- **More than one Google account.** On the hosted server, each request uses
  the linked account that can read the site. `seo_sites` lists properties
  from every linked account, and an access error names the linked accounts
  and links to the account page.

### Changed since 0.3.0-beta.2

- The hosted server now keeps a small encrypted store: your person id, your
  linked Google accounts, and any DataForSEO or Ahrefs keys you save. It
  keeps no report data, no Search Console or analytics rows, no site lists
  and no request logs. Delete everything on the account page,
  or revoke SEO Skill in your Google account.
- Hosted keys are saved on the account page instead of the sign-in page.
  Key headers still work, win over saved keys, and are used for that request
  only.
- Existing hosted connections must sign in with Google once more.
- Bing links and IndexNow stay removed.

### New in 0.3

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
