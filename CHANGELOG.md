# Changelog

## Unreleased

### Added

- `seo compare` shows Clicky visits before and after the date beside Search
  Console and Google Analytics, when a saved Clicky site has the site's
  domain: all visits, by traffic source, and from AI assistants.
- The weekly site audit asks ChatGPT search, Google AI Mode and AI Overviews
  the same 10 questions from the site's Search Console each week, on SEO
  Skill's DataForSEO account. The weekly summary shows which answers started
  or stopped citing the site and which sites they cite instead.

## 0.17.8

### Added

- `seo report` labels each query in `quick-wins`, `low-ctr`,
  `striking-distance`, `second-page` and `ai-queries` with its shape when
  one fits: `question`, `comparison` or an AI query kind such as
  `follow_up`, `chat` or `long`. Each section except `ai-queries` adds a
  line counting them. `seo page` labels a page's queries the same way, and
  `ai_answers` rows carry the shape of their question.

### Removed

- `seo data --query-preset` and `query_preset` on `seo_data`. The report
  now finds questions, comparisons and AI-style queries on its own, using
  the same definitions as `ai-queries`, `ai_answers` and content
  optimization. `--query-regex`, `--exclude-query-regex` and
  `--page-regex` stay for custom cuts.

## 0.17.7

### Added

- `seo data --query-preset` (and `query_preset` on the `seo_data` MCP
  tool) keeps only `questions`, `long_tail` queries of 8 words or more, or
  `comparisons`, the queries AI search and AI Mode leave in Search Console.
- `seo data --query-regex`, `--exclude-query-regex` and `--page-regex`
  (`query_regex`, `exclude_query_regex` and `page_regex` in MCP) filter
  rows with Search Console's regular expressions. Lookarounds,
  backreferences and expressions over 4,096 characters are rejected with
  an error instead of returning an empty result.

## 0.17.6

### Fixed

- `seo report` striking distance no longer lists one result's sitelinks
  as separate pages. Three or more pages for the same query with the same
  impressions and average position are left out and counted in the
  report's limits.
- Queries with a numbered prefix, such as "12264: keyword serp tracker",
  are flagged `likely-automated` and rank after real searches in striking
  distance, quick wins and low CTR.

## 0.17.5

### Added

- `seo lint` flags a reframe that repeats its subject, such as "The
  question isn't whether to optimize. The question is when to stop."
  (`negative-parallelism`).
- `seo lint` warns about a list written as prose: sentences that open "The
  first X", "The second X" and "The third X" in order (`anaphora`).

## 0.17.4

### Added

- `seo lint` warns when mid-sentence colons pile up, at three or more per
  1,000 words (`colon-density`). One colon is never flagged.
- `seo lint` finds more staged-prose tells, adapted from
  [declauding](https://github.com/oaustegard/claude-skills/releases/tag/declauding-v0.13.0):
  a bare denial after a sentence ("The sixth is not.", "; the data
  didn't."), a reading set up only to be called wrong, "That's why X
  mattered." closers, "the only X I trust", ", suggesting ..." tails, two
  stacked "from X to Y" ranges (`false-range`), and headings such as
  `What "X" means` or "X is dead".
- Warnings for a bold list label that the item repeats
  ("**Performance:** Performance has been improved") and for phrases such
  as "the part that really matters".

### Changed

- Help and tool text call the weekly site audit by its name instead of a
  beta.

## 0.17.3

### Added

- `seo research serp --provider <id>` reads live search results from an
  installed provider package that supplies them, in the CLI and the local
  MCP server. Rows match DataForSEO's, with the organic `position`,
  `rank_absolute` and `type`, and the result shows the package's own
  warnings, partial results and the cost it reports. A package reads up to
  its own depth limit, and the result says when that is less than asked.
  Build one from the
  [provider template](https://github.com/iannuttall/seo-provider-template).

### Changed

- `ai_answers` stops with an error for any provider other than DataForSEO,
  instead of only for Ahrefs.

## 0.17.2

### Added

- `seo research index_check --target <url>` checks whether Google returns a
  page. It runs a `site:` search and exact-phrase searches from the page on
  desktop and mobile through DataForSEO, spots when Google falls back to
  unrelated results, and answers indexed, not found or unknown with the
  searches as evidence.
- `seo research serp --device mobile` reads mobile results (DataForSEO).
- `serp` lists the sites an AI Overview cites, in the notes and as
  `aiOverviews` in the JSON.

### Changed

- `serp` and `ranked_keywords` rows have `position` as the organic
  position, with DataForSEO's `rank_absolute` and the result `type` beside
  it. `rank_absolute` counts AI Overviews, People Also Ask and other blocks,
  so a third organic link could read as position 7. When an AI Overview
  takes the first slot, organic results no longer seem to start at 2.
- DataForSEO searches that fail on Google's side (40101, 50000) are retried
  up to three times before the keyword is listed as failed.
- A crawl capped by `--max-pages` now samples sitemap URLs from every
  section in turn, shortest paths first, instead of the first URLs in
  sitemap order. The caveat says how the sample was chosen.
- `large_html` says where the main content starts against Googlebot's
  2 MB cut, how many bytes and visible words sit past it, and is high when
  the content is past or near the cut. Pages over the crawler's own 5 MB
  read limit get a partial `large_html` finding instead of a connection
  error.

### Fixed

- Crawls no longer run out of memory on sites with large pages. Each kept
  page summary held on to the whole HTML body, so memory grew by about
  2.6 MB a page; a 600-page posthog.com crawl stopped at 200 pages and now
  finishes.

## 0.17.1

### Added

- `seo lint` finds more AI writing tells: slogan fragments and kickers
  ("Every month. No exceptions.", "$299 per month. That's it."), two or
  more "No ..." sentences in a row, sales questions as headings ("Ready to
  ...?"), answers to doubts nobody raised ("It isn't perfect."), "Here's
  to ..." closers, formula triads, stacked ", allowing ..." riders, heavy
  bold and decorative emoji.
- `seo lint rules` lists every rule with its category, level and what it
  looks for; `--only ai` lists the AI-pattern rules. `seo_lint` takes
  `rules: true`.

### Changed

- One AI word on its own, such as a single "delve", is a warning; two or
  more in a piece are errors.
- `seo lint` fixes say to use a fact already in the text or cut the
  phrase, so a rewrite does not add claims.
- Triads flag only formula lists: parallel clauses, items that open with
  the same word or strings of adjectives. Plain lists of three pass.
- `seo page` reuses a URL Inspection result saved in the last 7 days;
  `--refresh` asks Google again.
- The hosted site audit reports an empty title or description
  (`title_empty`, `description_empty`) apart from a missing one. On the
  first run after this release, open `title_missing` or
  `description_missing` findings on pages whose tag is empty close and
  come back once under the new ids.

### Fixed

- `seo lint` false positives: the mic-drop review skips "#1" and lone
  numbers, single-quoted examples are skipped, factual corrections and
  concessions go to review instead of errors, title separators such as
  "Pricing - Example" are not dashes, and empty title and description
  tags are errors in every preset.
- Every Google API request has a timeout (60 seconds for URL Inspection,
  30 for the rest), so a stuck call cannot hang a run.
- The crawler reports an empty title or description apart from a missing
  one (`empty_title`, `empty_meta_description`). A saved monitoring
  snapshot may show one title change for a page whose title is empty.
- The hosted site audit reads googlebot meta tags and counts an
  X-Robots-Tag noindex only when it applies to Google. A robots meta of
  `none` now stops link-following there.
- The crawler follows redirects with the shared tracer: loop detection, a
  10-hop cap, a timeout on every hop and no retries of a loop.
- A robots.txt that answers with a web page reads as `unreadable`, with
  every AI bot's access unknown, and the crawl goes ahead as Google would.

## 0.17.0

### Added

- `seo research` reads a whole site, a subfolder (a target ending in `/`,
  such as `example.com/blog/`) or one page, with `--scope` to override.
  New actions: `top_pages` (pages with the most estimated search traffic)
  and `pages_by_backlinks` (pages with the most referring domains), on
  DataForSEO's Labs and Backlinks endpoints and on Ahrefs.
- `serp` with DataForSEO gives each result `domain_rank`, DataForSEO's own
  0 to 100 authority score, labelled as not Domain Rating.
- `ranked_keywords` gives the provider's traffic total for the whole
  target and names its traffic model, and says that providers can differ
  tenfold. A list cut at the rows read says how many the provider has.
- `seo lint --url <url>` checks a live page's main content, the same text
  `seo page --detail full` reads. `--only ai,copy,seo` checks one category
  of rules; every finding has a category and the summary counts them.
- `seo crawl --mode sites` reads robots.txt, the home page and llms.txt for
  up to 1,000 sites a run and streams one JSON line per site.
- `seo data` labels spam-looking queries with `spam_hint`, a heuristic.
  The rows and totals stay unchanged.
- `seo page` prints what it is waiting on, and for a page Google does not
  know, says how to get it found.
- `seo status` runs the same setup check as `seo doctor`.
- `seo research keyword_ideas` lists searches that contain each seed
  keyword, and `serp_overlap` counts the top 10 pages and sites each pair
  of keywords shares, saying how many results it could compare.
- `serp` takes `--depth` (default 20; the site's SERP checker reads 30).
- Research results are kept for a day, so the next page and `--detail
  full` cost nothing more; `--refresh` asks again. Full detail returns
  every row read, and the JSON gives `next` and `rowsLeftOut`.
- `ai_answers` takes `--also` for a brand's other domains and `--brand`
  for the names that count as a mention, and names what it matched.
- `seo redirect-trace --map redirects.csv` checks up to 1,000 old and new
  URL pairs and gives each a verdict.
- `seo lint --meta-kind title|description` says what plain meta lines are,
  and length findings give an estimated pixel width.

### Changed

- `provider` is optional in `seo research` and both MCP servers. Without
  it the saved key is used, DataForSEO when both are saved.

### Fixed

- `seo lint` counts files and pages it could not check, or checked only in
  part, in the totals and the summary, and exits 1, so a skipped file never
  reads as clean. HTML over the size limit is checked without its scripts
  and styles first.
- `seo doctor` passes a machine linked to a seoskill.dev account (`seo
  login` or `SEO_TOKEN`) and names its Google accounts, instead of failing
  the local Google checks.
- `seo page` says why Google index status is missing (quota, no access,
  sign-in, or no answer within 60 seconds) with the next step, instead of
  "not available".
- DataForSEO research on one page uses the page's full URL. Before, a page
  could come back with the whole site's keywords or no links at all.
- When robots.txt redirects to another host, the crawl reads its rules for
  AI bots. Before, every bot was reported as allowed.
- `keyword_metrics` lists a keyword with no volume as no data, and names
  each provider's volume model.
- Page facts read robots tags for one crawler, such as `googlebot`, and
  keep an empty title, description or H1 apart from a missing one.
- `seo page`, reports and `seo redirect-trace` share one redirect tracer
  with loop detection, a 10-hop cap and a timeout on every hop.
- `ai_answers` no longer counts placeholder domains such as yourdomain.com,
  or images in ChatGPT answers, as cited sites.
- The meta preset checks titles and descriptions sent as MCP text.

## 0.16.1

### Fixed

- `seo crawl` slows down when a site rate limits it, instead of stopping.
  After a 429, or a 503 with Retry-After, it waits as the site asks (up to
  30 seconds), drops to one request at a time with a gap between requests,
  and tries the page again. If pages are still unread, the first line says
  how many were read and gives a slower command to rerun. The same applies
  to `--health`, which also says when it checked only the first 500
  sitemap URLs and how to check more.
- The soft 404 check reports `complete: false` when a probe was skipped,
  blocked or rate limited, and retries it once after a cool-down.
- Cloudflare's `/cdn-cgi/` email protection links are no longer crawled or
  reported as broken internal links.
- Paging through `ai_answers` no longer asks every question again. Each
  result lists every answer's task, and the next-page command passes them,
  so later pages are read back at no cost.
- `link_gap` with DataForSEO gives the top 200 rows a Domain Rating and
  sorts them by it. URL shorteners, link lists and coupon or site-stats
  directories are left out, and the notes name each one.
- Domain Rating is filled for the page of rows being shown, not only the
  first 25 rows.

## 0.16.0

### Added

- `seo research link_gap --target <domain> --competitors <a>,<b>` lists
  the sites that link to two or more competitors and not to the target,
  highest authority first. It reads each site's top 1,000 referring
  domains. When a site has more, the list stops at the lowest authority it
  read and says so. `seo_research` takes `competitors` for the same action.
- `seo crawl` finds the Chrome that agent-browser and Playwright install,
  so `--rendering on` works without setting `SEO_BROWSER_EXECUTABLE_PATH`.

### Fixed

- The soft 404 check also requests a made-up top-level path and a nested
  one. It passes only when every made-up path returns a 404 or 410, so a
  site that answers unknown profile or page addresses with a 200 is no
  longer reported as fine.
- `--rendering on` stops with an error when no browser can start, instead
  of quietly crawling the raw HTML. A fallback under `--rendering auto` is
  now a crawl-level caveat.
- A crawl that can only reach its start page, because the page has no
  links in its HTML and the site has no sitemap, now leads the report with
  a high-severity fix that says to rerun with `--rendering on`.
- Pages whose canonical points to another crawled page in the group no
  longer count as duplicate titles, descriptions or content. The crawl
  reads at most 5 query-string versions of one path and reports how many
  it skipped.
- `research serp` asks DataForSEO again when it gets an empty results
  page, and says when a keyword stays empty instead of printing "No rows".
  Results that DataForSEO returns as Google redirect links keep their
  domain and a shortened `url_hint`, and the notes count them.
- `research keyword_metrics` lists the keywords the provider has no data
  for.
- `ai_answers` no longer counts DataForSEO, image hosts or example domains
  as cited sites.

## 0.15.2

### Fixed

- `seo_research` `ai_answers` on the hosted server no longer times out and
  charges for answers it never returns. Questions now go through
  DataForSEO's queue, which also costs less: about $0.07 for 10 questions
  instead of $0.12. Answers not ready after about 40 seconds come back as
  tasks that are already paid for. Pass them back in `tasks` (`--tasks` in
  the CLI) with the same target to read them at no cost. The CLI waits up
  to four minutes before handing tasks back.

### Added

- Each `ai_answers` row lists the other sites the answer cites, and the
  notes rank the sites cited most across all answers.

## 0.15.1

### Changed

- `seo research ai_answers` takes up to 10 questions in `--keywords` and
  asks those instead of the site's Search Console questions. With your own
  questions the target can be any domain, such as a competitor's, and no
  Search Console property is needed. `seo_research` does the same with
  `keywords`.

## 0.15.0

### Added

- `seo lint <paths>` checks copy for patterns common in AI-written text,
  weak copy, and title and description length. It reads Markdown, MDX,
  HTML, Astro and text files, up to 100 at a time, with presets for blog
  posts, landing pages, docs and meta lines. `--fail-on warning` fails a
  build on warnings too, and `--ignore` and `--ignore-phrase` skip rules or
  allow a phrase. `seo_lint` does the same in both MCP servers and takes
  the text itself.
- `seo crawl` flags sitemap URLs on another host, such as a staging or
  localhost address, a robots.txt that returns an HTML page, and an
  llms.txt that returns an HTML page. An HTML robots.txt counts as absent,
  so its rules are not read.

### Fixed

- `seo research serp` takes a result's domain from its breadcrumb when
  Google's redirect link can't be resolved.

## 0.14.0

### Added

- `seo site` builds a data-driven site on Astro and Cloudflare with your
  agent. `seo site new <folder>` copies a starter that already has titles,
  canonicals, JSON-LD, sharing images drawn from each H1, Markdown copies,
  `llms.txt` and sitemaps of up to 5,000 URLs. `seo site guide <step>`
  prints one step at a time: setup, market, data, plan, build, golden-page,
  writing, scale, launch and grow. `seo site check` runs the crawler's page
  checks on the built site, plus copy, design and data rules, and fails the
  build when a rule breaks.
- `seo report --site <site> --section issues` keeps a list of the issues
  found for a site between sessions: striking distance, low CTR and quick
  wins from Search Console, and the weekly crawl's findings and pages that
  dropped out of Google's index for a site in the weekly site audit. Each
  issue has an id, what the latest check saw (found, not found, or not
  checked when a check failed, was partial or capped) and a mark.
  `--mark fixed`, `ignored` or `open` with `--issues <ids>` and an optional
  `--note` records what the person decided. `seo_report` takes the same
  `section`, `mark`, `issues` and `note`. The CLI and local MCP keep the
  list in `issues.json` in the config folder; the hosted server keeps it
  only for sites in the weekly site audit, and deletes it with the site.
  For any other hosted site it says so and returns the list as JSON in
  the `issues.json` shape for the agent to save, and takes it back as
  `saved` so marks carry over.

## 0.13.3

### Fixed

- `seo data gsc-query` without `--start-date` and `--end-date` now covers
  the last 28 days of final data, as `seo report` does, instead of being
  refused by Google. A start date alone runs to the latest final day.
- A request Google refuses with a 400, such as a bad date or dimension, is
  reported as an input error with Google's reason, not as a provider outage
  to try again.

### Changed

- `seo report` with no site gives every audited site its week as facts,
  even in a quiet week: Google index checks, the weekly crawl and search
  clicks, with the sites that changed first. It no longer suggests next
  steps.
- The local MCP server's `seo_sites` says that adding a site to the weekly
  site audit happens on the hosted server at seoskill.dev/mcp.

## 0.13.2

### Fixed

- `seo research` calls to DataForSEO and Ahrefs no longer wait forever. A
  read gives up after 30 seconds and a DataForSEO task after 60. A read is
  tried again once after a timeout, a network failure or a busy provider. A
  DataForSEO task is tried again only when DataForSEO turned it away, so it
  is never charged twice.
- `seo research serp` keeps the results for keywords that answered when
  another keyword fails, and names the keywords to ask for again.
- A provider that is rate limiting is reported as rate limited.

## 0.13.1

### Fixed

- A local MCP client that starts `seo mcp` or `seo mcp --stdio` without
  `serve` now gets the server instead of an error on every launch.
- On Windows, skill install, `seo start`'s skill step, self-update and
  Codex MCP setup now run `npx`, `npm` and `codex`.
- A Search Console property is found for more ways of naming a site:
  http-only and subfolder URL-prefix properties, `www` domain properties,
  and stray spaces. When none matches, the error lists the properties the
  sign-in can read.
- A traffic drop check without enough daily data now says so and what to
  send, instead of reporting an internal error.
- `seo compare` rejects a date that is not on the calendar instead of
  failing, and names the latest date it can use when the date is too recent.
- A rejected DataForSEO or Ahrefs key is reported as a key problem, not as a
  bug to report.
- `seo reports` with no subcommand lists the reports, `seo reports --site x`
  runs `seo report`, and `seo reports <id>` runs that report. Section names
  such as `content-decay` and the spelling `cannibalization` work as report
  ids, and an unknown id lists the valid ones.
- `seo crawl example.com` and `seo crawl --site example.com` crawl
  `https://example.com/`. Crawl option mistakes are reported as input errors.
- A command group run on its own, such as `seo providers`, shows its help.
- `seo start` without a terminal says to run `seo login` instead of itself.
- A start date alone runs to the latest final day of Search Console data.

### Changed

- `seo login` names the agent that runs it from `AI_AGENT` or `AGENT`, or
  from more agents' own settings, when usage counts are on.

### Security

- Installs body-parser 2.4.0, qs 6.16.1, fast-uri 3.1.9 and
  @hono/node-server 2.1.5 or later, for the advisories published since
  0.13.0.

## 0.13.0

### Added

- `seo report` and `seo_report` with no site give last week across every
  site in the weekly site audit beta: a verdict, what needs a look with one
  next step each, what was quiet, and a prompt to ask next. It is the same
  summary as the Monday email, and it ends with the site to ask about next.
  On a machine, run `seo login` first. Without the beta, a missing site is
  still an error that says to name one.

### Changed

- Dependencies are updated to their latest minor and patch releases.

### Security

- The MCP SDK must be 1.32.1 or later, the release with the MCP TypeScript
  SDK fixes of 20 October 2026.

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
