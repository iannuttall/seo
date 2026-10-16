---
name: seo
description: Free Google Search Console MCP server and CLI for AI agents. Reads your real Search Console, Google Analytics and Bing Webmaster Tools data, plus DataForSEO and Ahrefs keyword research. Use it for any SEO question - why Google traffic or clicks dropped, organic traffic decline, quick wins, low CTR, striking distance keywords, content decay and declining pages, keyword cannibalization, indexing and URL inspection, one page's queries, Google update impact, competitor keywords, backlinks, technical SEO crawls, redirects, internal links and client SEO reports. Returns facts from your own data, never guesses.
---

# seo

SEO Skill returns facts from the person's own Search Console, Bing Webmaster
Tools and analytics, with Google update dates, plus keyword and competitor data from their own
DataForSEO or Ahrefs key. It gives no advice. You read the facts, show the
person what matters, and decide with them what to change.

There are two ways to reach the same commands:

- **MCP tools**, from the hosted server at `https://seoskill.dev/mcp` or the
  local server from `seo mcp serve`. Use them when they are connected.
- **The CLI**: `seo`, or `npx -y seo` when it is not installed. Sign in
  once with `seo login`: show the person the link it prints, then run
  `seo login` again after they approve. It uses the same seoskill.dev
  account as the hosted server (Google accounts, Bing, keys). A cloud agent
  can use an account-page token as `SEO_TOKEN`. Add `--json` for JSON; it
  never prompts.

Crawls, internal links and Bing run only in the CLI or the local MCP
server, on any machine with a shell.

## The commands

| CLI | MCP tool | What it returns |
|---|---|---|
| `seo report` | `seo_report` | The main report: overview, then every section's count and top rows |
| `seo page --url <url>` | `seo_page` | One URL: live page facts, Google index status, its queries |
| `seo compare --date <date>` | `seo_compare` | Equal periods before and after a date, with Google updates |
| `seo index` | `seo_index` | Pages that lost most of their clicks, checked live and with URL Inspection |
| `seo research <action>` | `seo_research` | Keyword metrics, ranked keywords, SERP, competitors, backlinks |
| `seo data` | `seo_data` | Raw Search Console or Bing rows (source `bing`); the MCP tool also reads analytics landing pages |
| `seo crawl` | `seo_crawl` | A site crawl with technical issues and the URLs they affect |
| `seo internal-links --url <url>` | `seo_internal_links` | Pages that could link to a target page |

Run `seo_sites` (or `seo sites`) when you do not know the property.
CLI commands need `--site` (or `--url`): `example.com`, a URL or
`sc-domain:example.com`. Nothing is saved between runs; keep your own notes.

## How to run them

1. Run `seo report --site <site>` (or `seo_report`) without a section. It shows totals
   against the previous period, the pages and queries that moved, and a short
   count with top rows for each section.
2. Pick the one section that matters and run it with `--section <id>` (or
   `section`). Sections: overview, quick-wins, low-ctr, striking-distance,
   second-page, content-decay, cannibalization, traffic-drop, bing. Page
   sections check their top 20 URLs live and merge same-site redirects.
3. Use `detail` `rows` with `offset` for the next page of rows, or `full` for
   every field. Start with the summary; ask for more only when you need it.
4. Each result ends with the command to run next. Follow it when it fits the
   question.

## Common jobs

| Job | Commands |
|---|---|
| Traffic or clicks dropped | `report`, then `compare` with the date the drop started, then `page` |
| More clicks from existing pages | `report` with the quick-wins, low-ctr or striking-distance section, then `page` |
| Pages losing clicks over time | `report` with the content-decay section, then `index` |
| Page missing from Google or lost all its clicks | `index`, then `page` |
| Two pages compete for one query | `report` with the cannibalization section, then `page` on each URL |
| A site change or Google update | `compare` with its date |
| Keyword and competitor research | `research` with keyword_metrics, serp, ranked_keywords or competitors |
| Backlinks | `research` with backlinks |
| Technical issues on a site | `crawl` |
| Internal links to a page | `internal-links` |
| A question the report does not answer | `data` |

## Bing

The report overview shows Google and Bing clicks for the same dates. The
`bing` section puts Bing's top queries and pages beside Google's numbers. Never
add Bing to Google. Bing lists only its top rows by week, so a missing row is
unknown, not zero. Bing runs in the CLI and local MCP server: connect Bing
on the account page and run `seo login`, or use `seo providers bing connect`.
The hosted server cannot reach Bing, so its totals are Google only: no Bing
data there is not "no Bing traffic". Run
`npx -y seo report --site <site> --section bing --json`.

## Research keys

Research costs the person's own provider credits. Keys and missing Google
accounts are added at `https://seoskill.dev/account`; the hosted server and
a CLI linked with `seo login` both use them. `seo providers <name> connect`
keeps a key on one machine only. Domain Rating appears
as a free column next to domains; credit it as "Domain Rating by Ahrefs".

## Evidence rules

- Name missing, partial, capped or filtered data before you interpret it. It
  never supports a zero or an all-clear.
- Keep Search Console, analytics, live page checks and provider estimates
  apart. Query rows do not add up to site totals.
- Flags such as likely-automated queries and curve-based CTR gaps are
  heuristics. They point to rows worth a look; they prove nothing.
- A Google update in the same window is timing, not cause.
- Intentional `noindex`, canonicals and redirects are observations until the
  person says they are wrong.
- Show the facts in a table and ask before you edit any page.

Old 0.2 report names, such as `seo quick-wins`, print their new command.
