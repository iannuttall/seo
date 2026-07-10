---
title: Find technical blockers to AI search eligibility
description: Check crawlability, indexing controls, page evidence, entities, and AI referrals without turning optional markup into unsupported citation promises.
---

AI search reports are useful when they remove technical blockers, improve the
page for people, or make evidence easier to verify. They become dangerous when
an optional file or markup pattern is presented as a citation score.

SEO Skills CLI keeps those two things separate.

## Reuse fresh page evidence instead of crawling twice

```sh
seo crawl --project example --save
seo ai-readiness --project example
seo entity-readiness --project example
seo llms audit --project example
```

These reports reuse a saved crawl. Run a fresh crawl when the site has changed
or the saved pages no longer represent what is live.

Start with `ai-readiness` for technical eligibility and page observations.
Use `entity-readiness` for naming, authorship, structured data, and linked
identity evidence. Run `llms audit` only when you care about the optional file
for a system that consumes it.

## Fix ordinary search blockers before AI-specific experiments

Failed responses, blocked crawling, `noindex`, a conflicting canonical, missing
main content, and restrictive snippet controls can remove or limit the content
a search feature can use.

Google's current
<a href="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide" target="_blank" rel="noreferrer">guidance for generative AI features</a>
says a page must be indexed and eligible for a Search snippet to be eligible
for AI Overviews and AI Mode. Google also says meeting the requirements does
not guarantee crawling, indexing, serving, or selection.

That gives the technical report a clear job. It can find evidence that blocks
eligibility or deserves verification. It cannot predict a mention.

## Use page evidence to improve the source itself

The crawler records visible content structure, semantic HTML, authorship,
dates, question headings, lists, tables, entity links, structured data, and
media evidence. Those observations can help an agent inspect whether a page:

- answers the user's actual question with specific, checkable information;
- makes the responsible person or organisation clear where that matters;
- keeps names, dates, facts, and linked identity signals consistent;
- uses structure that helps people scan and assistive technology navigate;
- contains original evidence rather than a rewrite of the same generic advice.

No single item in that list is a universal ranking requirement. Google advises
site owners to create helpful, reliable, people-first content and bring
first-hand knowledge or original analysis where it fits. Its
<a href="https://developers.google.com/search/docs/fundamentals/creating-helpful-content" target="_blank" rel="noreferrer">people-first content guidance</a>
is a better editorial reference than a made-up "AI-ready" word count.

## Treat structured data as eligibility evidence

Structured data can describe page entities and make supported content eligible
for rich results. The markup must match the visible page and include the
required properties for the chosen search feature.

Google's
<a href="https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data" target="_blank" rel="noreferrer">structured data introduction</a>
does not promise a rich result after valid markup. Google also says there is no
special schema required for its generative AI search features.

The reports therefore record detected types, missing or invalid fields, and
page mismatches as evidence to inspect. They do not convert schema coverage
into an AI visibility score.

## Use llms.txt only for systems that consume it

```sh
seo llms generate --project example --output llms.txt
seo okf export --project example --output ./okf
seo okf validate ./okf
seo export knowledge --project example --format markdown --output knowledge.md
```

These exports can help an agent or retrieval system that explicitly reads
them. They can also give you a concise inventory of the pages and concepts in a
saved crawl.

Google's generative AI search guidance says Google Search does not use
`llms.txt` or special AI text files. Publishing one neither helps nor harms
Google Search visibility according to that guidance. Maintain the file only
when it serves a real consumer. Otherwise it is another stale index waiting to
happen.

## Respect snippet controls as intentional site policy

Google applies controls such as `nosnippet`, `max-snippet`, and
`data-nosnippet` to its search appearances, including AI Overviews and AI Mode.
Its
<a href="https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag" target="_blank" rel="noreferrer">robots meta and snippet specification</a>
defines the current behavior.

The crawler should report those controls. It should not tell you to remove
them without understanding why they exist. A publisher may have legal,
licensing, privacy, or product reasons to limit snippets.

## Measure referrals without pretending they cover every AI visit

```sh
seo ai-referrals --project example
```

The GA4 report groups measurable visits from known AI referral sources. It can
show a real landing page, source, and session count when GA4 received them.

Referrer stripping, apps, redirects, privacy controls, and changing source
domains make that evidence incomplete. "No retained AI referrals" means the
query found none in the available GA4 rows. It does not prove that no person
found the site through an AI product.

Google now directs site owners to its own Search Console reporting for
visibility in Google generative AI features. Other providers expose different
or no first-party reporting, so keep source-specific evidence separate.

## Give an agent a claim it can defend

Ask for findings in this shape:

1. The exact page evidence or provider row observed.
2. The eligibility issue or optional observation derived from it.
3. The limit on what that evidence can establish.
4. A bounded change and a way to verify it.

The [agent workflow guide](/docs/agents) covers that evidence discipline. Use
the [crawler guide](/docs/crawler) when a finding depends on robots, canonicals,
rendered HTML, or structured data.
