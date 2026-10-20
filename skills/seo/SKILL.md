---
name: seo
description: Free Google Search Console MCP server and CLI for AI agents. Reads your real Search Console, Google Analytics, Bing Webmaster Tools and Clicky data, plus DataForSEO and Ahrefs keyword research. Use it for any SEO question - why Google traffic or clicks dropped, organic traffic decline, quick wins, low CTR, striking distance keywords, content decay and declining pages, keyword cannibalization, indexing and URL inspection, one page's queries, Google update impact, the questions people ask AI that show in Search Console, competitor keywords, backlinks, technical SEO crawls, redirects, internal links and client SEO reports. Returns facts from your own data, never guesses.
---

# seo

`seo` reads Search Console, Google Analytics, Bing Webmaster Tools and Clicky
data, crawls sites, checks live pages, and gets keyword and backlink data from
DataForSEO or Ahrefs.

Use the MCP tools when they are connected (hosted at
`https://seoskill.dev/mcp`, or local with `seo mcp serve`). Otherwise use the
CLI: `seo`, or `npx -y seo`. Add `--json` for JSON.

`seo crawl --url <url>` needs no sign-in and works on any site, local and
staging too. The other commands need the person's data: `seo login` prints a
link for them to approve, then run it again.

| CLI | MCP tool | Returns |
|---|---|---|
| `seo report --site <site>` | `seo_report` | Search Console overview and sections |
| `seo page --url <url>` | `seo_page` | One URL: live page, index status, queries |
| `seo compare --site <site> --date <date>` | `seo_compare` | Before and after a date, with Google updates |
| `seo index --site <site>` | `seo_index` | Pages that lost their clicks, checked live |
| `seo research <action>` | `seo_research` | Keywords, SERP, competitors, backlinks |
| `seo data --site <site>` | `seo_data` | Raw Search Console, Bing, Clicky or Google Analytics rows |
| `seo crawl --url <url>` | `seo_crawl` | Technical issues across a site |
| `seo internal-links --url <url>` | `seo_internal_links` | Pages that could link to a page |
| `seo sites` | `seo_sites` | The properties the person can read |

Each result ends with the command to run next. `seo <command> --help` shows
the options.
