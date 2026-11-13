---
name: seo
description: Free Google Search Console MCP server and CLI for AI agents. Reads your real Search Console, Google Analytics, Bing Webmaster Tools, Clicky and Simple Analytics data, plus DataForSEO and Ahrefs keyword research. Use it for any SEO question - why Google traffic or clicks dropped, organic traffic decline, quick wins, low CTR, striking distance keywords, content decay and declining pages, keyword cannibalization, indexing and URL inspection, one page's queries, Google update impact, the questions people ask AI that show in Search Console, competitor keywords, backlinks, technical SEO crawls, redirects, internal links, client SEO reports and building a new programmatic SEO site. Returns facts from your own data, never guesses.
---

# seo

`seo` reads Search Console, Google Analytics, Bing Webmaster Tools, Clicky and
Simple Analytics data, crawls sites, checks live pages, and gets keyword and
backlink data from DataForSEO or Ahrefs.

Use the MCP tools when they are connected (hosted at
`https://seoskill.dev/mcp`, or local with `seo mcp serve`). Otherwise use the
CLI: `seo`, or `npx -y seo`. Add `--json` for JSON.

`seo crawl --url <url>` needs no sign-in and works on any site, local and
staging too. The other commands need the person's data: `seo login` prints a
link for them to approve, then run it again.

| CLI | MCP tool | Returns |
|---|---|---|
| `seo report --site <site>` | `seo_report` | Search Console overview and sections; with no site, last week across the sites in the weekly site audit |
| `seo page --url <url>` | `seo_page` | One URL: live page, index status, queries |
| `seo compare --site <site> --date <date>` | `seo_compare` | Before and after a date, with Google updates |
| `seo index --site <site>` | `seo_index` | Google's indexing reasons, labelled, and pages that lost their clicks |
| `seo submit <url...>`, `--indexmysite` | `seo_submit` | Ask Bing and others to crawl pages (IndexNow, free, after `seo submit key <site>`), or send them to Google with Index My Site (the person's credits; quote first, send with `--yes` or `confirm: true` only after they agree) |
| `seo research <action>` | `seo_research` | Keywords, keyword ideas, SERP (organic position, mobile) and SERP overlap, whether Google indexed any URL (`index_check`), top pages, competitors, backlinks, pages by backlinks, link gaps, AI answer citations, for a site, subfolder (`example.com/blog/`) or page; provider optional; next pages are free for a day |
| `seo data --site <site>` | `seo_data` | Raw Search Console, Bing, Clicky, Simple Analytics or Google Analytics rows |
| `seo crawl --url <url>` | `seo_crawl` | Technical issues across a site |
| `seo internal-links --site <site>` or `--url <url>` | `seo_internal_links` | Links to add across a site, or to one page |
| `seo lint <files>` or `--url <url>` | `seo_lint` | Lines in a draft, title, description or live page that read as AI-written, each with a fix; `--only ai` for AI patterns alone; no sign-in |
| `seo sites` | `seo_sites` | The properties the person can read |
| `seo site new <folder>`, then `seo site guide <step>` | CLI only | Build a new data-driven site on Astro and Cloudflare, one step at a time. Its build runs `seo site check` |

Each result ends with the command to run next. Start small and ask for more:
a site, then a `--section` (`section`), then `--detail rows` or `full`.
`seo <command> --help` shows the options.

## Issues kept between sessions

`seo report --site <site> --section issues` (`section "issues"`) checks the
site again and keeps a list of what it found, each with an id, the latest
check (found, not found or not checked) and what the person marked it. When
the person says they fixed an issue or want it left alone, record it:
`--mark fixed` or `--mark ignored` with `--issues <id>,<id>` (`mark`,
`issues`, optional `note`). Read the list at the start of a session instead
of reporting old issues as new. "Fixed" is the person's word; the list says
when the check still finds it. The CLI and local MCP keep the list in
`issues.json`; the hosted server keeps it only for sites in the weekly site
audit. For any other site the result says the server is not storing it and
ends with the list as JSON (`{"version":1,"sites":{"<site>":[...]}}`, the
`issues.json` shape): save it in the person's project, such as
`.seo/issues.json`, and pass its contents as `saved` with the next `issues`
or `mark` call so marks carry over.

## Google updates

When the person asks whether a Google update hit the site, run
`seo report --site <site> --section google-updates` (`section
"google-updates"`). It compares the latest ranking update's days with the
same days before and says whether that is outside the site's normal
movement. `--end-date` (`end_date`) picks an earlier update. Report it as
timing, never as the cause.

## Indexing reasons each week

`seo index` inspects known URLs in a fixed order (lost-click pages, Search
Console pages by clicks, the sitemap, the rest), 100 by default, and labels
each Google reason fix, check, expected or indexed from a live check. In the
CLI or local MCP, `--max-urls` (`max_urls`) asks for more, up to today's
quota, and reuses saved inspections up to 7 days old, so paging or `--detail
full` costs no quota. Run it once for a baseline and keep the full result (`--detail full`).
Run it again each week with the same number and compare by URL and reason: a
new reason, or a URL that moved to fix, is what to report.
`seo` keeps no history, so you store the results. Once this runs weekly, the
person can turn off Search Console's indexing emails. For one URL from such an
email, run `seo page --url <url>`.
