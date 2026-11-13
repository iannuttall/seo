---
name: writing-how-id-grow-posts
description: "Researches, writes and launches a \"How I'd grow <company>\" SEO teardown on the seoskill.dev blog: SEO Skill data for every domain the company owns, an interactive MDX post, seo lint, an Amp draft document for Ian's review, and a planned X post tagging the company. Use when asked to write, draft, update or publish a How I'd grow post or teardown, or to pick the next company for the series."
---

# Writing How I'd grow posts

One post a day while there's a backlog: a pure SEO and AEO teardown of a company people know, built from SEO Skill data, written as interactive MDX in `apps/web/src/content/blog/<slug>.mdx`, and shared on X with the company tagged ("How I'd grow @every with SEO"). It markets SEO Skill and Index My Site, so every post shows how it was made and ends with both.

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
- **`seo_research` with DataForSEO** for keyword metrics and backlinks. DataForSEO returns most SERP results as Google redirect links, so those rows have no `url`, only the domain and a shortened `url_hint`; the notes count them. Build "who ranks" tables from Ahrefs (`provider ahrefs` or the Ahrefs MCP). A "No results" note means Google showed an empty page twice, not that nothing ranks.
- **One provider per table**, named in the caption. Ahrefs and DataForSEO volumes can differ by 7 times for the same search.
- **The CLI** for crawls. Hosted platforms (Substack, Webflow, Shopify) rate-limit, so crawl them with `--concurrency 2 --fetch-interval-cap 1 --fetch-interval-ms 1200 --refresh`.
- Ahrefs MCP calls return the data JSON, then a second JSON object (`{"apiUsageCosts":...}`) and a line starting "Display these". Cut the raw text at `\n{"apiUsageCosts"` (or at `\nDisplay these`) and parse what comes before it. Ask the SERP overview for one keyword per call.
- **AI answers:** `seo research ai_answers --target <domain> --keywords "<q1>,<q2>"` asks ChatGPT search, Google AI Mode and AI Overviews up to 10 questions through DataForSEO, for any domain, and says whether each answer cites or mentions it (about $0.01 a question). Run it once, with the same questions for the top competitor, so the result has a comparison (step 13). Ahrefs Brand Radar isn't on the plan.

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
9. **The founder's best social posts:** find the founder's and the company's most viewed or most linked posts on X and other networks. Read the last two weeks of X posts, with views, likes, reposts and bookmarks, from FxTwitter's public API (`https://api.fxtwitter.com/2/profile/<handle>/statuses`, sent with a user agent; it often answers 404 for a real account, so retry a few times). Then read older posts found on the company's site, in its newsletter or in Ahrefs referring pages one by one from `https://api.fxtwitter.com/2/status/<id>`. These are research steps for the post, not `seo` commands. For each long or evergreen post, check whether a web copy exists and gets search traffic, then map its sections to searches with volume (`KeywordTable`). A post with millions of views and no web page that ranks is a finding.
10. **AI readiness:** request the homepage and one post as a browser, GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot (`curl -A "<user agent>"`). Record the status and whether the full text comes back. Also read the robots.txt rules for those bots, check whether llms.txt exists and returns text (not HTML), and check for Markdown copies and structured data. Say what the platform allows (Substack, Webflow, Ghost and so on) before recommending a change it can't make. A user agent string isn't the bot's real IP, so call these results what the site serves to that user agent.

11. **Keyword research for new content:** this is half the post, not an extra. For each topic the company could own:
    - **Competitor gap:** find 3 to 5 competitors (`seo research competitors --target <domain>`, plus the names people compare it with). Pull each one's ranking keywords (`ranked_keywords`) and list the searches with volume where a competitor ranks and the company has no page.
    - **What competitors publish:** for the biggest gaps, read the ranking pages (`serp`) and record the page type (guide, glossary, comparison, template, free tool), length and who it's written for. Say how the company could do it better: first-hand data, the founder's voice, a tool instead of an article.
    - **Clusters:** group the gaps into clusters with a head term and the supporting searches, total volume and the easiest difficulty. Each cluster gets a proposed page: title, URL, the sections it covers and the searches each section answers (`KeywordTable`).
    - **Social posts:** every post from step 9 that's worth a page gets the same treatment: target search, title, URL and sections mapped to searches.
12. **Free tools and programmatic pages:** look for searches with tool intent (checker, generator, calculator, template, "free") and for repeatable page patterns (one page per tool, model, integration or city) in the company's niche. Record volume, who ranks and what the company already has (data, an API, a product feature) that could power the page. Propose only what the company can build from what it owns.
13. **AI answers:** write 10 questions before running anything, and save them in the research folder so they can't be swapped after you see the results. Split them into three kinds. Product questions ask about the company's own product, such as its price, a feature or how to set it up. Category questions ask what something is or how to do it. Choice questions ask which product to pick, with "best", "vs" or "alternatives". Run `ai_answers` once for the company and once for its top competitor, with the same questions. Before a claim rests on one answer, or on a difference of one or two, ask those questions once more. If the answer changes, drop the claim or give both results.

    Count each engine and each kind of question separately. For every answer, record whether it links a company page, names the company without a link, or does neither, and which page it links.

    Read the counts against what's normal. ChatGPT usually links a brand it names. Google's AI Mode and AI Overviews usually cite lists, videos and forums for choice questions, even when they name the brand. All three usually link the brand's own page for product questions. A gap that matches this pattern isn't a finding.

    These are findings:
    - An answer a company page should supply that cites a third party or the wrong company page instead, such as the homepage or another country's copy.
    - A choice question where a competitor's own page is cited. It shows a vendor page can win that question, so the company needs one too.
    - The lists and videos cited for choice questions. They are the outreach and content targets.

    For each finding, check whether the company has a page titled with the question, and whether that page ranks in Google for the search. That decides most of what Google's AI answers cite. Pair it with step 10. An AI crawler that gets the full page but no citation points to content, not access.
14. **Links and PR:** links come from having something worth linking to, so look for what the company owns that others would cite.
    - **Link gap:** run `seo research link_gap --target <domain> --competitors <a>,<b>,<c> --provider ahrefs`. It lists the referring domains that link to two or more competitors and not to the company, highest Domain Rating first. Then find the competitor page each one links to. Group them by why they link: a tool, a data report, a comparison, a quote in a news story.
    - **Unique data:** list the data only the company has (usage numbers, benchmarks, model scores, a survey of its readers, prices it tracks) and one report each could become, with a dated headline a journalist could quote ("1.7% of 49,345 sites were deindexed in March 2024"). Check who covered the last report like it (`serp` for the topic plus "study", "report" or "data"), since those writers are the outreach list.
    - **Linkable tools:** from step 12, mark the tool pages that sites in the link gap already link to on a competitor.
    - **Outreach the company can hand to an agent:** for each target, the page that would link, the reason it should (a broken or outdated link it could replace, a stat the company has newer data for), and whether it already sells links. Leave out sites that sell links or have no topical reason to link. Ian's method is at https://ian.is/cold-outbound-backlinks.
    Propose only reports and tools the company can build from what it owns. Name real data, never a generic "do a study".

Write every number with its source and month. Third-party estimates are called estimates.

## 3. Write the post

Frontmatter:

```yaml
title: How I'd grow <Company> with SEO        # 30 to 60 characters
description: ...                              # one plain sentence, 70 to 160 characters
heading: How I'd grow <Company>
lead: One or two short sentences, as you'd say it out loud.
date: 'YYYY-MM-DD'                            # the day it ships; the post goes live as soon as it's approved
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

Voice (from Ian, November 2026; applies to every blog post):

- **Write it like Ian talking to someone he respects, with an opinion.** The research makes the post right; it isn't the post. A teardown is still a person saying what they'd do and why, not a report.
- **Keep the description and lead short and plain.** Say what the post is about in the words you'd use out loud. Don't stack the finding, the method and the promise into one sentence.
- **Don't open on whatever prompted the post.** A tweet, a thread or a conversation can be the idea without being cited, credited or dated in the opening. If it earns a mention, put it lower down.
- **Not every point needs a number or a date.** Use one where it changes what the reader believes. A paragraph can just be an opinion, an example or what Ian would do. Avoid a date or count in every sentence and every heading.
- **Skip the formula.** No key findings box unless the post is a long data report, no heading that is a stat with a count, and no "N things" framing when plain words work. Vary the shape of sections; they don't all need claim, source, number, steps.
- **Say only what the reader needs.** No background, history or naming for its own sake: "AEO, also called GEO" is enough, not which term is older. Cut any sentence that doesn't help the reader understand the point or act on it.
- **Headings name the thing.** Every H2 says plainly what the section is about: "Where AEO and SEO actually differ", not "So what actually changed?". No teaser or rhetorical headings. They don't have to carry a keyword, and never stuff one in.
- **Sources back up a point; they aren't the structure.** Quote one or two lines that make the point better than paraphrase, link the rest.

Series rules:

- **One domain beats subdomains; less is more.** Recommend folding subdomains and side sites into subfolders on the main domain, or into the platform's post path when it can't serve folders, with a 301 from every old address. Make an exception only with evidence against it, and say what the evidence is. The referring domain counts from step 8 show what each move gains.
- **Turn the best social posts into lasting pages.** When step 9 finds them, propose the playbook: the long version on the web, a short post that links to it, and the link in a reply under the original post.
- **Lead with the upside.** The title, the lead and the first section open on what the company could win (the searches, the data it already owns, what's already working), never on spam, gambling, penalties or a problem in its link profile. Put spam, hijacked pages and similar cleanup last, in a short neutral housekeeping section, and keep the numbers. Order the fixes by the growth they bring.
- **An Ahrefs count is a minimum.** A count of ranking pages, spam accounts or links that Ahrefs finds is the floor, not the total: write "starting with the 24 that rank", not "the 24 accounts".
- **Brand search is a strength, not a problem.** Call searches for the company's own name brand searches (or brand search, brand demand), the industry term, never "people typing its name". Brand demand shows the company is known, and Google already treats it as an entity, which makes non-brand pages easier to rank. Frame the gap as non-brand search: the people who need the product and don't know the brand yet. Leave brand searches out of keyword gap tables and say so in the caption. When the name is a common word (Amp, Linear, Notion), searches for the word aren't all brand demand: say what else the word means and treat only the clearly branded searches ("amp code", "ampcode") as brand.
- **Only findings go in the post.** The research steps are a checklist for you, not a list of sections. When a step finds nothing to act on, leave it out: no heading, no "I checked X and found nothing". Keep an absence only when the absence is the finding ("Amp was in none of 28 AI answers").
- **Lead with the point, not the method.** Open a section with what's true, not "I requested..." or "I pulled...". The method goes in a short clause or the exhibit caption.
- **No judgment words.** "Unusually", "remarkably", "impressively", "well set up", "strong" and the like say nothing a reader can check. State the fact instead.
- Load the `writing-research-led-content` skill for the research and accuracy standard. Where its structure rules (counts in headings, key findings, a date on every claim) make a post read like a report, the voice rules above win.
- **Real tables, not code blocks.** Never line up columns with spaces in a code block. Use `UrlMap`, `KeywordTable` or a Markdown table, and check it at 390px.

Sections, in this order, adjusted to the company:

1. Intro: what the company is and how it makes money.
   For a media company or newsletter, the "revenue lines" below are what brings readers and sponsors: new subscribers from search, and evergreen pages sponsors pay to appear on.
2. Where its search traffic lands (`TrafficMap`), and why most of it doesn't sell.
3. One section per revenue line: the demand, who ranks, whether the company can compete there, and what page it needs.
4. Portfolio links: where the company's own sites link to each other, with an example page and the exact link.
5. New content: the keyword clusters from step 11, the free tools and page patterns from step 12, and the social posts worth a page. Each proposal has a target search with volume, a title and its sections.
6. AI search: what crawlers get (step 10) and the AI answer findings from step 13, by engine and kind of question, with the fixes the platform allows.
6a. Links and PR (step 14): the link gap as a `UrlMap` or table, the data reports with draft headlines, and the outreach list an agent can work through with the company approving each email. Leave the section out when step 14 finds nothing to act on.
7. Technical fixes, closest to revenue first. Each gets an `###` subsection: what it is in plain words, an exhibit that shows it, **The fix:** with best practice, and how to confirm it worked.
8. The plan, under a heading that says what it gets the company in plain words ("What I'd change to send US searches to US pages"), never a bare "The plan": every change as a numbered list (`PlanSteps`, no "Agent 1" labels), then how to check the results (`PlanSteps` with `marker: "Day 0"` and so on). No implementation timeline, and no lines about shipping it all today, sprints or agents running in parallel.
9. Get the changes seen quickly: Index My Site for every changed and new URL.
10. How I ran this: the hosted MCP first (free, Google sign-in, research key on the account page), then the CLI for crawling, then the prompt. No disclosure line: it's a product site, so readers can see we build the tools.

Rules that came from Ian's reviews:

- Pure SEO and AEO, tied to revenue. No vanity traffic wins.
- Refer to pages by name ("their courses page"), not bare paths, in prose.
- A strong claim stays when it is specific and the numbers sit next to it. Portable puffery goes.
- Name a fix the company can act on, with an example from their own site.
- Report AI answer counts by engine and by kind of question. Never add the engines together into one "named in X, linked in Y".
- Don't promise to close the gap between mentions and links. Name the citations the company can win and the page that would win each one.
- The fix the evidence supports for AI citations is a page titled with the question, with a paragraph that answers it, that ranks for the search. An answer in the first lines, a visible date and a matching video are reasonable but unproven, so call them heuristics.
- Never present llms.txt, Markdown copies or schema as a way to get cited, because Google says its AI features ignore them. Put them under what agents can read.
- The Day 30 check asks the same questions once more. Report a change only when it shows up across several questions, or when a specific new page is now cited. A shift of one or two answers can be normal variation.

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

## 6. Feed it back into SEO Skill

Every audit finds things the product could do for anyone. Before Ian's review, list them at the end of `.amp/in/research/<slug>-<date>/sources.md`:

- a check you ran by hand that every site would benefit from (it belongs in `seo crawl` or a report)
- a command that refused, broke or needed a workaround (log it in `docs/known-issues.md`)
- data you pulled from a provider directly that `seo research` should return

Then raise the list with Ian. Only changes any SEO Skill user would want go into the product; research helpers for these posts stay in this skill.

## 7. Ian's review

Turn the post into Markdown with `node .agents/skills/writing-how-id-grow-posts/scripts/mdx-to-markdown.mjs apps/web/src/content/blog/<slug>.mdx` and publish it as an Amp document artifact titled "Draft: How I'd grow <Company>" in the folder "How I'd grow". Read the artifact's comments before each update, and reply to each comment you address.

## 8. Publish and launch

Only after Ian approves the post:

1. Before merging, re-pull the headline numbers and recheck that the issues are still live. Update anything that changed.
2. Publish as soon as it's approved: set `date` to today and `draft: false`, run all four repo gates, and ship through a PR to `main`. Don't hold a ready post for a later date; only the X posts are spaced out.
3. Submit the post URL to Index My Site once it's live.
4. Draft the X post in Typefully as a plain post draft (not an X Article, and no `plan_at` or `publish_at`). The whole text is exactly two lines with a blank line between: `How I’d grow @handle with SEO` (curly apostrophe, the company's X handle from `x.company`), then the bare post link `https://seoskill.dev/blog/<slug>` with no utm parameters. No findings, no data and no other text. X builds the card from the post's cover. Ian schedules it himself, for 13:15 UK time on the next free day in the X queue (one teardown a day), and only once the post returns 200.
