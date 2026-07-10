# GEO and AI search

GEO is commonly used for work aimed at generative search experiences. For Google Search, the same foundational SEO practices apply and there are no extra technical requirements for AI Overviews or AI Mode.

Google's [generative AI Search guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) explicitly says to focus on foundational SEO and ignore tactics such as artificial content chunking or minimum-format hacks.

The crawler does not guess whether a page will be cited. It records technical eligibility evidence and clearly labels optional heuristics that do not establish visibility or citation likelihood.

## What the crawler checks

The GEO rules look for:

- machine-readable structure through JSON-LD and schema
- AI crawler access in robots.txt
- optional agent resource files such as OpenAPI, MCP metadata, ai-plugin, and agent descriptors
- semantic HTML such as `main`, `article`, and clean heading structure
- authorship and trust signals
- published or modified dates
- question-style headings
- lists, tables, and other extractable blocks
- optional `/llms.txt` presence, reported without affecting SEO or AI-readiness scores
- entity signals such as Organization, Person, Product, WebSite, sameAs, and official social links

Run:

```bash
seo crawl --project keep --severity medium
```

For focused readiness slices after a saved crawl:

```bash
seo ai-readiness --project keep
seo entity-readiness --project keep
seo llms audit --project keep
```

For agent workflows, use MCP tools `seo_ai_readiness`, `seo_entity_readiness`, `seo_llms_txt_audit`, and `seo_geo_gaps`.

## Site knowledge exports

Agents work better when the site has a compact, cited knowledge bundle.

```bash
seo llms generate --project keep --output llms.txt
seo okf export --project keep --output ./okf
seo okf validate ./okf
seo okf explain ./okf
```

`llms.txt` can be a short entry point for agents that explicitly support it. Google says it is not needed for Search and has no positive or negative visibility impact. OKF is the richer site knowledge bundle: index, log, concepts, inventory, graph, caveats, and citations.

You can also use the generic export command:

```bash
seo export knowledge --project keep --format okf --output ./okf
seo export knowledge --project keep --format markdown --output knowledge.md
seo export knowledge --project keep --format json --output knowledge.json
```

## What the AI-search helpers do

`seo seo-to-ai-query` turns GSC queries into prompts you can monitor manually or with a future AI visibility tracker.

```bash
seo seo-to-ai-query --project keep
```

Example output might turn a search query like `best payroll software for contractors` into prompts such as:

- What should someone know about payroll software for contractors?
- Which payroll software options are best and why?
- How do I choose the best payroll software for contractors?

`seo ai-referrals` scans GA4 for referral traffic from known AI sources.

```bash
seo ai-referrals --project keep
```

GA4 can miss AI visits when the referrer is stripped. Treat this as evidence, not the whole truth.

## What is not built yet

True AI visibility tracking is still future work.

That means we do not yet:

- ask ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews on a schedule
- record whether your brand was mentioned
- record which URLs were cited
- compare share of voice against competitors
- track prompt visibility over time

The current product audits technical eligibility and records supporting observations. It does not claim those observations cause mentions or citations.
