<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/s-dark.svg">
    <img src="assets/brand/s.svg" alt="SEO Skill" width="120">
  </picture>
</p>

# SEO Skill

[![npm](https://img.shields.io/npm/v/seo?style=flat-square)](https://www.npmjs.com/package/seo)

Real SEO data for your AI agent. Not guesses.

Ask an agent why your traffic dropped and it will happily make something up.
It has never seen your Search Console. So it reaches for the same generic
checklist everyone else gets.

SEO Skill gives your agent your own data: Search Console, Google Analytics,
Bing and Clicky, with Google update dates laid over it. It can crawl your
site, check any page live, and pull keyword and competitor data when you
need it. It is free and open source, and it gives your agent facts, not
advice. Your agent does the thinking. You decide what changes.

I use it every day on my own sites. Hack around with it. Make it yours.

## Setup (30 seconds)

Pick one.

<details>
<summary><strong>Hosted MCP</strong> (nothing to install)</summary>

```bash
claude mcp add --transport http seoskill https://seoskill.dev/mcp
codex mcp add seoskill --url https://seoskill.dev/mcp
```

For any other agent, add `https://seoskill.dev/mcp` as a remote MCP server.
Sign in with Google when it asks. That is your account: no password, no
signup form.

</details>

<details>
<summary><strong>CLI</strong> (adds crawls and Bing, runs on your machine)</summary>

```bash
npm i -g seo
seo start
```

`seo start` signs you in with Google, then offers to connect the MCP server
to the agents it finds and to install the skill. That is all it asks.

</details>

Then ask your agent something real:

```text
Why did clicks drop on example.com last month?
```

## Why it exists

I built it to fix the ways agents fail at SEO.

### #1: The agent guesses

**The problem.** An agent with no data writes generic advice: "add more
keywords", "improve your meta descriptions". It sounds right and helps no one.

**The fix.** Give it the numbers. `seo report` returns your site's totals
against the last period, the pages and queries that moved, and every section
worth a look: quick wins, low click-through rate, page two, decay,
cannibalization, sudden drops. `seo compare` lines up the weeks before and
after a date with the Google updates in between.

### #2: Third-party tools are estimates

**The problem.** Keyword tools estimate your traffic from a sample. They miss
the long tail, and they disagree with each other.

**The fix.** Your own data first. Search Console and your analytics are the
source of truth. Keyword and competitor data from DataForSEO or Ahrefs is
there when you need it, labelled and kept apart, never blended in.

### #3: The agent says "it's fixed" without checking

**The problem.** Agents trust their own edits. Then the page is still
noindexed, still redirecting, still missing from Google.

**The fix.** `seo page` checks one URL live and asks Google whether it is
indexed. `seo index` checks the pages that lost their clicks. `seo crawl`
checks the whole site, including what AI agents can read: robots rules for
AI bots, Markdown copies and llms.txt.

### #4: Too many reports

**The problem.** SEO tools ship hundreds of reports, and nobody reads them.
This project once had 70. Most went unused.

**The fix.** Eight commands. Each takes a site or URL and optional dates,
and returns everything it has. No settings to tune. Every result ends with
the command to run next, so your agent always knows where to go.

## The commands

| Command | What it returns |
| --- | --- |
| [`seo report`](https://seoskill.dev/docs/report) | Search Console overview, then each section's top rows |
| [`seo page`](https://seoskill.dev/docs/page) | One URL: the live page, Google index status and its queries |
| [`seo compare`](https://seoskill.dev/docs/compare) | Before and after a date, with Google updates |
| [`seo index`](https://seoskill.dev/docs/indexing) | Pages that lost their clicks, checked live and with Google |
| [`seo research`](https://seoskill.dev/docs/research) | Keywords, SERPs, competitors and backlinks from your own key |
| [`seo data`](https://seoskill.dev/docs/data) | Raw Search Console, Bing and Clicky rows |
| [`seo crawl`](https://seoskill.dev/docs/crawl) | Technical issues and AI agent access across a site (CLI) |
| [`seo internal-links`](https://seoskill.dev/docs/internal-links) | Pages that could link to a page (CLI) |

Each one is also an MCP tool (`seo_report`, `seo_page` and so on). Add
`--json` to any command for scripts and CI.

## What it keeps

Almost nothing. The hosted server keeps your linked Google accounts and any
keys you save, encrypted. No report data, no Search Console rows, no request
logs. The CLI keeps your sign-in in your system keychain. Read the
[privacy policy](https://seoskill.dev/privacy).

## More

- [Documentation](https://seoskill.dev/docs)
- [Cloud agents and CI](https://seoskill.dev/docs/cloud-agents)
- [Add your own analytics source](https://github.com/iannuttall/seo-provider-template)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Questions and bugs](https://github.com/iannuttall/seo/issues)

Apache-2.0. Names and artwork are covered by the
[brand policy](TRADEMARKS.md).
