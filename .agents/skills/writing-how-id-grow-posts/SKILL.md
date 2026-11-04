---
name: writing-how-id-grow-posts
description: "Researches, writes and launches a \"How I'd grow <company>\" SEO teardown on the seoskill.dev blog: SEO Skill data for every domain the company owns, an interactive MDX post, seo lint, an Amp draft document for Ian's review, and a planned X post tagging the company. Use when asked to write, draft, update or publish a How I'd grow post or teardown, or to pick the next company for the series."
---

# Writing How I'd grow posts

One post a month: a pure SEO and AEO teardown of a company people know, built from SEO Skill data, written as interactive MDX in `apps/web/src/content/blog/<slug>.mdx`, and shared on X with the company tagged ("How I'd grow @every with SEO"). It markets SEO Skill and Index My Site, so every post shows how it was made and ends with both.

The published examples are the reference: `how-id-grow-every.mdx` (a portfolio company) and `how-id-grow-monologue.mdx` (one product inside it). Read both before writing a new one. Read `CONTENT.md` and `apps/web/AGENTS.md` too.

## 1. Pick the company

- Start from the prospect list artifact in the thread folder "How I'd grow", or Signpost (topic `x-growth`).
- Good targets: a company Ian's audience knows, a founder active on X, a clear gap between authority and search traffic, and ideally several brands or domains. The portfolio links are where the cheapest wins usually are.
- List every domain and brand it owns before any research. Check whether a "small" site actually moved domain: follow redirects from the old one. Check alternate TLDs (.app, .net, .ai) for full mirrors that return 200, not only redirects. Leave out a domain you can't tie to the company.
- Note related companies that are not owned: a former parent or spin-out. Their links to the company still count, but describe them as a separate company.
- Read the X handle from the company's own site (footer, author pages). Never guess one. It goes in frontmatter `x.company`: the account that speaks for the brand. When there is no company account and the founder is the brand (a personal newsletter), use the founder's handle there.

## 2. Pull the data with SEO Skill

Setup in a fresh orb: if the work comes from another thread, pull it with `download_thread_changes` and `overwrite: true` (without it, modified tracked files are skipped). Then run `pnpm build` once before `pnpm build:package && node dist/cli.js ...`, or the CLI can't find `@seo/core`.

Sources:

- **Ahrefs MCP directly** (find it with tool_search) for top pages, traffic history, competitor traffic, SERP overviews and volumes. `seo_research` has no top-pages action, and the hosted account may have no Ahrefs key.
- **`seo_research` with DataForSEO** for keyword metrics only. Its SERP rows currently come back as `google.com/goto` links (a known bug), so don't build "who ranks" from them.
- **One provider per table**, named in the caption. Ahrefs and DataForSEO volumes can differ by 7 times for the same search.
- **The CLI** for crawls. Hosted platforms (Substack, Webflow, Shopify) rate-limit, so crawl them with `--concurrency 2 --fetch-interval-cap 1 --fetch-interval-ms 1200 --refresh`.
- Ahrefs MCP calls can return JSON with trailing text: parse from the raw result up to the last `}`. Ask the SERP overview for one keyword per call.
- AI answers for an outside site can't be measured with these tools. Leave AEO claims to what you can see on the page.

Save raw output under `.amp/in/research/<slug>-<date>/` (biome ignores `.amp/`), with a `sources.md` that lists each number, its tool call and date. Transcribe MCP output there by hand, since code_exec can't write files. Never commit real data outside the post itself.

For each domain:

1. **Where the traffic lands:** `seo_research` top pages (Ahrefs), then group pages by kind: sells something, brand searches, editorial, typos and off-topic. This is the `TrafficMap` at the top of every post.
2. **Each revenue line:** the searches buyers make, with US volume, difficulty and who ranks (`keyword_metrics`, `serp`). A keyword table always shows volume and who ranks, never CPC alone.
3. **Crawl:** `seo crawl <url> --max-pages 600` on every domain, including parent and sister sites. Pull out the links between the company's own sites (destination, link text, count). Check typo and parked domains.
4. **Technical issues:** take the crawl's issues and confirm each by hand on a live page before writing about it. Also check by hand:
   - **Sitemap against navigation:** diff the sitemap and the linked sections. Whole sections missing from one or the other are findings the crawl won't flag.
   - **Unknown URLs:** request a made-up URL and record the status, including any redirect to a sign-in page that returns 200.
   - **Canonicals on money pages:** pricing and signup pages, on every domain that serves them.
5. **Dead or moved sections:** when a subdomain or section that used to get traffic now fails, list its old URLs from the Wayback Machine CDX API (`https://web.archive.org/cdx/search/cdx?url=<host>/*&output=json&fl=original&collapse=urlkey`), then check them with `seo crawl --mode list --urls-file <file>`. Look for copies of the old pages elsewhere that nothing redirects to.
6. **Links between the company's sites:** the crawler treats other subdomains as off-origin, so it doesn't report their broken links. Pull every link out of the post bodies in the crawl JSON, request each target on another of the company's hosts, and count 404s, homepage redirects and good destinations. Count post-to-post links from the body only; the crawler's inlink counts include navigation.
7. **Traffic swings:** when the history drops, check whether rankings dropped or whether the brand word is ambiguous and Ahrefs' click estimate for it changed. Say which one it is.
8. **Every domain and subdomain:** list each host the company uses (links in the site and the newsletter, certificate transparency at `https://crt.sh/?q=%25.<domain>&output=json`, old addresses from the Wayback Machine). For each, record what it serves, its status and its referring domains (Ahrefs). This table backs the one-domain recommendation.
9. **The founder's best social posts:** find the founder's and the company's most viewed or most linked posts on X and other networks. Run `seo social-posts <handle>` for the last two weeks of X posts with views, likes, reposts and bookmarks, then pass older post URLs found on the company's site, in its newsletter or in Ahrefs referring pages with `--posts` to get their numbers too. For each long or evergreen post, check whether a web copy exists and gets search traffic, then map its sections to searches with volume (`KeywordTable`). A post with millions of views and no web page that ranks is a finding.
10. **AI readiness:** request the homepage and one post as a browser, GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot (`curl -A "<user agent>"`). Record the status and whether the full text comes back. Also read the robots.txt rules for those bots, check whether llms.txt exists and returns text (not HTML), and check for Markdown copies and structured data. Say what the platform allows (Substack, Webflow, Ghost and so on) before recommending a change it can't make. A user agent string isn't the bot's real IP, so call these results what the site serves to that user agent.

Write every number with its source and month. Third-party estimates are called estimates.

## 3. Write the post

Frontmatter:

```yaml
title: How I'd grow <Company> with SEO        # 30 to 60 characters
description: ...                              # 70 to 160 characters
heading: How I'd grow <Company>
lead: One or two sentences with the finding.
date: 'YYYY-MM-DD'
company: <Company>
x:
  company: <handle without @>
draft: true
cover:
  alt: What the art shows, in one sentence.
  title: center                               # or left when the subject stands on the right
```

Cover: every post gets illustrated art, saved as `apps/web/public/blog/covers/<slug>.webp`. The post shows it above the article, and the build draws the title over it for the sharing card.

- Make the company's mascot or mark the hero when it has one (Ben's Bites' red mascot, Amp's olive green Puck), drawn in its real colours.
- Give each post its own style and palette (screenprint, risograph, engraving, film still) so the covers don't look alike. Take the colours from the company's brand.
- The scene shows the post's main finding as a picture a reader gets at a glance.
- Leave a calm band where the title goes: the middle for `center`, the left half for `left`. No text in the art.
- Save it at 1200×630: `magick in.png -resize 1200x630^ -gravity center -extent 1200x630 -quality 70 -define webp:method=6 <out>.webp`, under about 250 KB.
- Build the site and check `dist/blog/<slug>/index.png`: the title must be legible and clear of the subject.

Series rules:

- **One domain beats subdomains; less is more.** Recommend folding subdomains and side sites into subfolders on the main domain, or into the platform's post path when it can't serve folders, with a 301 from every old address. Make an exception only with evidence against it, and say what the evidence is. The referring domain counts from step 8 show what each move gains.
- **Turn the best social posts into lasting pages.** When step 9 finds them, propose the playbook: the long version on the web, a short post that links to it, and the link in a reply under the original post.

Sections, in this order, adjusted to the company:

1. Intro: what the company is and how it makes money.
   For a media company or newsletter, the "revenue lines" below are what brings readers and sponsors: new subscribers from search, and evergreen pages sponsors pay to appear on.
2. Where its search traffic lands (`TrafficMap`), and why most of it doesn't sell.
3. One section per revenue line: the demand, who ranks, whether the company can compete there, and what page it needs.
4. Portfolio links: where the company's own sites link to each other, with an example page and the exact link.
5. Technical fixes, closest to revenue first. Each gets an `###` subsection: what it is in plain words, an exhibit that shows it, **The fix:** with best practice, and how to confirm it worked.
6. "Ship it all today, then let it settle": the fixes as parallel agent jobs (`PlanSteps`, numbered, no "Agent 1" labels), then 30 days of checks (`PlanSteps` with `marker: "Day 0"` and so on). Never a week-by-week sprint.
7. Get the changes seen quickly: Index My Site for every changed and new URL.
8. How I ran this: the hosted MCP first (free, Google sign-in, research key on the account page), then the CLI for crawling, then the prompt.

Rules that came from Ian's reviews:

- Pure SEO and AEO, tied to revenue. No vanity traffic wins.
- Refer to pages by name ("their courses page"), not bare paths, in prose.
- A strong claim stays when it is specific and the numbers sit next to it. Portable puffery goes.
- Name a fix the company can act on, with an example from their own site.

## 4. Exhibits

Every exhibit must show something the prose can't: which pages, who ranks, where traffic lands, what changes. No stat-card rows and no decoration. All stay inside the prose column. Components (in `apps/web/src/components/blog`, available in posts without imports):

| Component | Use it for |
|---|---|
| `TrafficMap` | Where a site's search traffic lands, by kind of page |
| `CompareBars` | Ranking sites or pages by one number |
| `VerticalBars` | A number over time, with markers for events |
| `TrafficCurve` | Several series over time |
| `KeywordTable` | Searches with volume, difficulty, who ranks and the company's position |
| `SerpLadder` | Who ranks for one search, and where the company would slot in |
| `PageGrid` | Every page on a site, grouped, with the ones that matter lit |
| `UrlMap` | A set of URLs and what to do with each (keep, 301, fix) |
| `SearchResult` | How a page looks in Google: title, address and description, today and after the fix |
| `BrowserFrame` | What a visitor sees at an address: tab title, address bar, status and the page |
| `TitleSheet` | Title tags across many pages, with length, duplicates flagged and the fix; sortable |
| `BeforeAfter` | Code, redirects, headers or link markup before and after a fix |
| `PlanSteps` | The parallel jobs, and the dated checks |
| `Callout`, `Exhibit` | Anything else, wrapped in the same panel |

### Pick the exhibit for each finding

When a draft names a concrete thing a reader could look at, show it; don't only describe it. After writing each finding, ask which component lets the reader see the problem and the fix at a glance:

| The finding is about | Show it with |
|---|---|
| A title tag, meta description or how a page reads in Google | `SearchResult` with `before` and `after` |
| Titles across many pages, duplicates or a template pattern | `TitleSheet` |
| What a visitor gets at an address (soft 404, wrong page, sign-in wall) | `BrowserFrame` |
| A redirect chain, status code, canonical, robots line or header | `BeforeAfter` with the request and response in a `<pre>` |
| Markup or a link that changes | `BeforeAfter` with `code` |
| Many URLs and what to do with each | `UrlMap` |
| Which pages on a site matter, or how many are missing | `PageGrid` |
| Who ranks for a search, and where the company would fit | `SerpLadder` |
| Searches to target | `KeywordTable` |
| Traffic over time, or one number across sites | `VerticalBars`, `TrafficCurve`, `CompareBars` |

Write the exact current value from the live site and the exact proposed value, so the reader can copy the fix. If no component fits a finding that needs a visual, say so in the report back, and don't force a poor fit.

Multi-line HTML for `BeforeAfter` goes in an `export const` at the top of the post. JSX attribute strings can't hold `\"`; use `&quot;`. When an exhibit quotes the company's own copy and it trips `seo lint` (a dash in a real title), put `// seo-lint-ignore dash` on the line above that prop or row.

Data limits in the components:

- **`KeywordTable`:** keep a "who ranks" cell to two names, or the table scrolls sideways on phones.

Check every exhibit in the dev server (`amp orb service start blog-dev --command 'cd apps/web && pnpm exec astro dev --host 127.0.0.1 --port $PORT' --portal` if it isn't running; drafts render only there) at desktop and phone width, light and dark, with screenshots inspected. With agent-browser:

- `set viewport 1280 900 2` and `390 844 2` for the two widths, and `set media dark` for dark mode (the site follows the system setting).
- Scroll each exhibit into view and wait a second, because exhibits fill in on scroll. If it still captures empty, run `document.documentElement.classList.remove('motion')` first so every exhibit shows its final state.
- Capture the viewport, not the element: element captures below the fold come out blank.
- Click the second tab of each `BeforeAfter` and capture that too. `PlanSteps` renders as `ol.plan-steps`, not a figure.

## 5. Gates before Ian sees it

1. The post renders in the dev server with no errors (a broken JSX attribute passes lint but crashes the page).
2. `node dist/cli.js lint apps/web/src/content/blog/<slug>.mdx` shows 0 errors and 0 warnings. Read every "to review" item and change the line only when it fails the question.
3. Every number traces to `sources.md`.
4. `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm lint` pass, and the post stays out of `dist` and the sitemap while `draft: true`.

## 6. Ian's review

Turn the post into Markdown with `node .agents/skills/writing-how-id-grow-posts/scripts/mdx-to-markdown.mjs apps/web/src/content/blog/<slug>.mdx` and publish it as an Amp document artifact titled "Draft: How I'd grow <Company>" in the folder "How I'd grow". Read the artifact's comments before each update, and reply to each comment you address.

## 7. Publish and launch

Only after Ian approves the post:

1. On publish day, re-pull the headline numbers and recheck that the issues are still live. Update anything that changed.
2. Set `draft: false`, run all four repo gates, and ship through a PR to `main`. Merging deploys the site.
3. Submit the post URL to Index My Site.
4. Draft the X post in Typefully as a plain draft (`typefully.create_draft` with no `plan_at` or `publish_at`). Line one is the post title with the company's handle ("How I'd grow @every with SEO"), then a short summary of the main findings, then the post link. One mention only: `x.company`. The post link is the only URL or domain in the text, so X builds the card from our post; describe other sites in words ("a second domain", "the main site"). Put `seo` commands in backticks. Run `seo lint` on the text with `--preset landing`. Ian schedules it himself.
5. To try an X Article instead, create a separate `x_article` draft from the post's Markdown, and compare performance before choosing a default.
