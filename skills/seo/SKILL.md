---
name: seo
description: Use and read this skill immediately if the user request is in any way related to SEO or a site's organic search. That includes clicks or traffic changes, quick wins, CTR, rankings, content decay, cannibalization, Google update impact, indexing problems, one page's performance, keyword research, competitors, backlinks, crawling, redirects, metadata, internal links, Search Console, Google Analytics or Clicky questions, and client SEO reporting. Routes to first-party search data through the seo CLI and MCP tools.
---

# seo

SEO Skill returns facts from the person's own Search Console and analytics,
with Google update dates, plus keyword and competitor data from their own
DataForSEO or Ahrefs key. It gives no advice. You read the facts, show the
person what matters, and decide with them what to change.

There are two ways to reach the same commands:

- **MCP tools**, from the hosted server at `https://seoskill.dev/mcp` or the
  local server from `seo mcp serve`. Use them when they are connected.
- **The CLI**. Before the first call, run `command -v seo`. If it is missing,
  run `npm i -g seo`, then `seo start` to sign in with Google. Add `--json`
  for machine-readable output; JSON mode never prompts.

Crawls and internal links run only on the person's machine, through the CLI
or the local MCP server.

## The commands

| CLI | MCP tool | What it returns |
|---|---|---|
| `seo report` | `seo_report` | The main report: overview, then every section's count and top rows |
| `seo page --url <url>` | `seo_page` | One URL: live page facts, Google index status, its queries |
| `seo compare --date <date>` | `seo_compare` | Equal periods before and after a date, with Google updates |
| `seo index` | `seo_index` | Pages that lost most of their clicks, checked live and with URL Inspection |
| `seo research <action>` | `seo_research` | Keyword metrics, ranked keywords, SERP, competitors, backlinks |
| `seo data` | `seo_data` | Raw Search Console rows; the MCP tool also reads analytics landing pages |
| `seo crawl` | `seo_crawl` | A site crawl with technical issues and the URLs they affect |
| `seo internal-links --url <url>` | `seo_internal_links` | Pages that could link to a target page |

Start with `seo_sites` (or `seo sites`) when you do not know the property.
Sites can be given as `example.com`, a URL or `sc-domain:example.com`.

## How to run them

1. Run `seo report` (or `seo_report`) without a section. It shows totals
   against the previous period, the pages and queries that moved, and a short
   count with top rows for each section.
2. Pick the one section that matters and run it with `--section <id>` (or
   `section`). Sections: overview, quick-wins, low-ctr, striking-distance,
   second-page, content-decay, cannibalization, traffic-drop. Page sections
   check their top 20 URLs live and merge same-site redirects.
3. Use `detail` `rows` with `offset` for the next page of rows, or `full` for
   every field. Start with the summary; ask for more only when you need it.
4. Each result ends with the command to run next. Follow it when it fits the
   question.

Each command takes its target and optional dates, nothing more. Brand terms,
minimum impressions and the comparison period are set automatically and shown
in the output.

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

## Research keys

Research costs the person's own provider credits. On the hosted server, keys
come from the sign-in page or from client headers. In the CLI and the local
server, keys come from `seo providers <name> connect`. Domain Rating appears
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
- Never promise clicks, rankings, indexing or traffic.
- Show the facts, for example in a table, and ask before you edit any page.

Old report names from version 0.2, such as `seo quick-wins`, still run in
0.3 and print their new command. Use the new commands.
