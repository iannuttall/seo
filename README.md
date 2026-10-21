<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/s-dark.svg">
    <img src="assets/brand/s.svg" alt="SEO Skill" width="120">
  </picture>
</p>

# SEO For Agent-Native Teams

[![npm](https://img.shields.io/npm/v/seo?style=flat-square)](https://www.npmjs.com/package/seo)

The SEO data I give my agents every day, so they work from my real numbers
instead of guessing.

Most AI SEO tools do one of two things. They hand your agent a checklist of
generic advice, or they feed it estimates from a keyword tool that has never
seen your site. Either way you end up with the same pages everyone else is
publishing. Pages written from a keyword list aren't SEO. They're slop.

This works the other way round. It's a Google Search Console MCP server and
CLI, and it doesn't tell your agent what to do. It gives it the facts: your
clicks, impressions and positions from Search Console, your visits from
Google Analytics or Clicky, your Bing data, the dates of Google updates, and
a crawl of your site. Your agent works out what matters, and you decide what
changes.

It's free and open source. Hack around with it. Make it your own.

## Installation (30-second setup)

### 1. Connect it to your agent

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add --transport http seoskill https://seoskill.dev/mcp
```

</details>

<details>
<summary><strong>Codex</strong></summary>

```bash
codex mcp add seoskill --url https://seoskill.dev/mcp
```

</details>

<details>
<summary><strong>Any other agent</strong></summary>

Add `https://seoskill.dev/mcp` as a remote MCP server. Cursor, Claude
Desktop, VS Code and most other agents support it.

</details>

<details>
<summary><strong>The CLI</strong> (for crawls and Bing, which run on your machine)</summary>

```bash
npm i -g seo
seo start
```

`seo start` signs you in, connects your agents and installs the skill.

</details>

### 2. Sign in with Google

Your agent opens a Google sign-in. Pick the account that can see your Search
Console. That's your account. There's no password and no signup form.

### 3. Ask it something real

```text
Why did clicks drop on example.com last month?
```

That's it. You're ready to go.

## What you can ask it

- "Why did clicks drop last month? Was it the core update?"
- "Which pages are close to page one, and what do they rank for?"
- "Is this page indexed? If not, why not?"
- "Which searches does this page show up for that it never mentions?"
- "Can ChatGPT, Claude and Perplexity read my site?"
- "Who am I up against in search, and is there demand for a 'vs' or alternatives page?"

Your agent picks the commands, reads the results and shows you what it found.

## Why it exists

I built this because agents kept failing at SEO in the same few ways.

### #1: The agent makes things up

**The problem.** Ask an agent why your traffic dropped and you get a tidy
list of possible causes. Algorithm update, technical issues, content
quality. None of it comes from your site, so none of it helps.

**The fix** is to give it your numbers:

- [`seo report`](https://seoskill.dev/docs/report) shows your totals against the last period, the pages and queries that moved, and the places worth a look: quick wins, low click-through rates, pages stuck on page two, decay and cannibalization.
- [`seo compare`](https://seoskill.dev/docs/compare) lines up the weeks before and after a date, with the Google updates in between.

### #2: Keyword tools are guessing too

**The problem.** Ahrefs and Semrush estimate your traffic from a sample.
They miss most of the long tail, and they rarely agree with each other.

**The fix** is to start from your own data. Search Console is the source of
truth for Google. When you do need keyword volumes or competitor data,
[`seo research`](https://seoskill.dev/docs/research) uses your own
DataForSEO or Ahrefs key, and it keeps those estimates apart from your real
numbers.

### #3: The agent says it's fixed when it isn't

**The problem.** Agents trust their own edits. Then you find the page is
still noindexed, still redirecting, or still not in Google.

**The fix** is to check the live site:

- [`seo page`](https://seoskill.dev/docs/page) loads one URL and asks Google whether it's indexed.
- [`seo index`](https://seoskill.dev/docs/indexing) checks every page that lost its clicks.
- [`seo crawl`](https://seoskill.dev/docs/crawl) checks the whole site, including what AI agents can read.

### #4: Too many reports

**The problem.** SEO tools love reports. The first version of this had about
70 of them, and almost nobody used most of them.

**The fix** was to cut it down to a handful of commands. Each one takes a
site or a URL, and dates if you want them. There are no settings to tune. Every result
ends with the command to run next, so your agent always knows where to go.

## Reference

| Command | What it returns |
| --- | --- |
| [`seo report`](https://seoskill.dev/docs/report) | Your Search Console overview, then the top rows of each section |
| [`seo page`](https://seoskill.dev/docs/page) | One URL: the live page, its Google index status and its queries |
| [`seo compare`](https://seoskill.dev/docs/compare) | Before and after a date, with Google updates |
| [`seo index`](https://seoskill.dev/docs/indexing) | Pages that lost their clicks, checked live and with Google |
| [`seo research`](https://seoskill.dev/docs/research) | Keywords, search results, competitors and backlinks from your own key |
| [`seo data`](https://seoskill.dev/docs/data) | Raw Search Console or Bing rows |
| [`seo analytics`](https://seoskill.dev/docs/analytics) | Landing pages from Google Analytics or Clicky |
| [`seo crawl`](https://seoskill.dev/docs/crawl) | Technical issues and AI agent access across a site (CLI only) |
| [`seo internal-links`](https://seoskill.dev/docs/internal-links) | Internal links to add across a site or to one page (CLI only) |

Every command is also an MCP tool, such as `seo_report`. Add `--json` to any
command when you're scripting it.

## What it keeps

As little as possible. The hosted server keeps your linked Google accounts
and any keys you save, encrypted. It doesn't keep your Search Console data,
your reports or request logs. The CLI keeps your sign-in in your system
keychain. The [privacy policy](https://seoskill.dev/privacy) has the details.

## Links

- [Documentation](https://seoskill.dev/docs)
- [Cloud agents and CI](https://seoskill.dev/docs/cloud-agents)
- [Add your own analytics source](https://github.com/iannuttall/seo-provider-template)
- [Changelog](CHANGELOG.md) and [contributing](CONTRIBUTING.md)
- [Questions and bugs](https://github.com/iannuttall/seo/issues)

Apache-2.0. The name and artwork are covered by the
[brand policy](TRADEMARKS.md).
