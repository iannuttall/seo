import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesAF: Partial<
  Record<string, ReportGuideOverride>
> = {
  'affected-urls': {
    name: 'Find URLs affected by a crawl issue',
    summary:
      'Open the exact URLs behind a crawl finding and turn a summary count into a limited review or fix list.',
    lead: 'Use this after a crawl identifies a rule, category, or severity that matters. It retrieves the affected pages with their evidence and first-party metrics without loading the whole crawl into context.',
    inputs: [
      {
        label: 'Saved or fresh crawl findings',
        role: 'Provides issue instances, rule ids, affected pages, severity, and technical evidence.',
      },
      {
        label: 'Optional rule, category, and severity filters',
        role: 'Narrows the result to the finding you are ready to inspect.',
      },
    ],
    checks: [
      'Matches crawl issue instances against the requested rule, category, or severity.',
      'Orders URLs by severity and available clicks, impressions, and sessions before applying the explicit limit.',
    ],
    returns: [
      'Affected URLs with rule id, severity, detail, evidence, and available Search Console or GA4 metrics.',
      'Selection metadata showing total matches, returned rows, limit, and whether the list was truncated.',
    ],
    seo: {
      title: 'Affected SEO URLs: Find Every Page Behind a Crawl Issue',
      description:
        'Find the exact URLs affected by an SEO crawler rule, category, or severity and keep technical evidence, search metrics, limits, and truncation visible.',
      heading: 'Find every URL affected by a specific crawl issue',
    },
  },
  'ai-readiness': {
    name: 'Check AI search technical readiness',
    summary:
      'Review crawl access, indexability, snippet controls, page structure, and optional agent resources without inventing an AI visibility score.',
    lead: 'This report checks whether technical controls could prevent pages being crawled, indexed, or used with snippets. It cannot predict selection, citations, rankings, or traffic from an AI product.',
    inputs: [
      {
        label: 'Saved or fresh crawl report',
        role: 'Provides response, robots, indexability, snippet, page structure, and optional resource evidence.',
      },
      {
        label: 'Current Google AI feature guidance',
        source: 'ai-features',
        role: 'Defines which normal crawl, index, and snippet controls also apply to Google AI search features.',
      },
    ],
    checks: [
      'Reviews fetch access, robots rules, indexability, canonicals, and page-level snippet restrictions.',
      'Reports page structure, structured data, and optional agent resources as observations rather than citation or visibility requirements.',
    ],
    returns: [
      'Technical eligibility blockers and affected pages grouped by the observed control.',
      'Separate optional observations, source status, crawl limits, warnings, and caveats with no aggregate score.',
    ],
    seo: {
      title: 'AI Search Readiness: Check Crawl, Index, and Snippet Controls',
      description:
        'Check crawl access, indexability, snippet controls, page structure, and optional AI resources without relying on an invented visibility or citation score.',
      heading: 'Check the technical controls that affect AI search eligibility',
    },
  },
  'ai-referrals': {
    name: 'Find AI referral traffic',
    summary:
      'See which known AI products sent referral sessions recorded by GA4 and which landing pages received them.',
    lead: 'Use this for observed referral traffic rather than visibility estimates. The report only counts GA4 rows that match documented AI referral sources inside the chosen date range.',
    inputs: [
      {
        label: 'GA4 traffic acquisition rows',
        source: 'ga4-acquisition',
        role: 'Provides session source, landing page, sessions, engagement, and the selected date scope.',
      },
      {
        label: 'Documented AI referral source rules',
        role: 'Defines which returned source values are included in the AI referral result.',
      },
    ],
    checks: [
      'Matches returned session-source rows against explicit known AI referrer rules.',
      'Aggregates matching sources and landing pages while leaving unclassified traffic outside the AI total.',
    ],
    returns: [
      'AI referral sessions grouped by matched source and landing page with the requested GA4 date range.',
      'Returned-row limits and caveats for missing referrers, consent, redirects, attribution settings, and source changes.',
    ],
    seo: {
      title: 'AI Referral Traffic: Find Visits From ChatGPT and More in GA4',
      description:
        'Find AI referral sessions recorded in GA4, see the matched sources and landing pages, and keep date scope, attribution limits, and missing referrers clear.',
      heading: 'Find referral traffic from known AI products in GA4',
    },
  },
  'audit-page': {
    name: 'Audit one page',
    summary:
      'Inspect one live URL before changing its metadata, canonical, directives, structured data, links, or content.',
    lead: 'Use this when the question is about one page. The report fetches the live URL, records what it can observe, and keeps title width, heading counts, and content length as evidence rather than universal quality rules.',
    inputs: [
      {
        label: 'Live page fetch and extraction',
        source: 'javascript',
        role: 'Provides redirects, response, metadata, headings, links, directives, structured data, and page text.',
      },
      {
        label: 'Optional exact-URL Search Console context',
        source: 'search-analytics',
        role: 'Adds returned query and performance evidence when the URL belongs to the selected property.',
      },
    ],
    checks: [
      'Records fetch diagnostics, final URL, response, canonical, robots directives, metadata, headings, links, and structured data.',
      'Labels estimates and heuristics explicitly and keeps fetch failures or unavailable first-party data separate.',
    ],
    returns: [
      'A page snapshot with observed technical, metadata, content, link, and structured-data evidence.',
      'Focused findings, optional Search Console context, caveats, and verification steps for the exact URL.',
    ],
    seo: {
      title: 'SEO Page Audit: Check One URL Before You Change It for SEO',
      description:
        'Audit one live URL for redirects, canonicals, directives, metadata, headings, links, schema, and content evidence before making an SEO change.',
      heading: 'Audit one live page before you change it',
    },
  },
  'audit-urls': {
    name: 'Audit selected URLs',
    summary:
      'Run the crawler checks across a chosen list of pages without discovering or crawling the rest of the site.',
    lead: 'Use this for launch checks, representative templates, migration samples, or post-fix verification. Each supplied URL gets the same technical checks as a crawl, but no extra pages are discovered.',
    inputs: [
      {
        label: 'Explicit URL list',
        role: 'Defines the exact pages to fetch and the maximum scope of the audit.',
      },
      {
        label: 'Optional Search Console and GA4 project context',
        source: 'search-analytics',
        role: 'Adds available first-party page value without widening the URL list.',
      },
    ],
    checks: [
      'Fetches only the supplied URLs and runs the maintained technical SEO rules on each successful response.',
      'Keeps failed, redirected, skipped, partial, and capped pages distinct and never starts a discovery crawl.',
    ],
    returns: [
      'A compact summary with page status, grouped technical findings, top fixes, warnings, and caveats.',
      'Optional limited page and issue inventories plus a saved report id when storage is requested.',
    ],
    seo: {
      title: 'SEO URL List Audit: Check Selected Pages Without a Crawl',
      description:
        'Audit an exact list of URLs with technical SEO checks for launch gates, template samples, migrations, and post-fix verification without crawling the site.',
      heading: 'Audit a selected list of URLs without crawling the whole site',
    },
  },
  cannibalisation: {
    name: 'Review query overlap and cannibalisation',
    summary:
      'Find queries associated with several URLs and separate healthy search coverage from genuine intent, canonical, or consolidation problems.',
    lead: 'Multiple URLs appearing for one query is not automatically cannibalisation. This report gives you the overlap, metrics, and page evidence needed to decide whether the pages compete, complement each other, or need technical review.',
    inputs: [
      {
        label: 'Returned Search Console query and page rows',
        source: 'search-analytics',
        role: 'Provides the URLs, query, clicks, impressions, CTR, and average position in the chosen period.',
      },
      {
        label: 'Optional live-page verification',
        source: 'canonical',
        role: 'Adds current canonical, indexability, metadata, and content evidence for selected URLs.',
      },
    ],
    checks: [
      'Groups returned rows by query and keeps only queries associated with more than one eligible URL.',
      'Ranks overlap consistently and separates observed exposure from heuristic intent or technical review signals.',
    ],
    returns: [
      'Overlapping queries with their URLs, metrics, concentration, and the evidence behind the review priority.',
      'Optional page observations and cautious actions such as leave alone, inspect intent, review canonicals, or consider consolidation.',
    ],
    seo: {
      title: 'SEO Cannibalisation Review: Find Query and URL Overlap in GSC',
      description:
        'Find Search Console queries associated with multiple URLs and review intent, canonicals, and page evidence before calling the overlap cannibalisation.',
      heading: 'Find query overlap before deciding pages are competing',
    },
  },
  'community-intent': {
    name: 'Find community and comparison searches',
    summary:
      'Surface searches containing explicit review, comparison, forum, recommendation, or first-hand experience wording.',
    lead: 'Use this to find language that may call for opinions, comparisons, evidence, or lived experience. The phrase classifier creates a review hypothesis, not a complete model of intent.',
    inputs: [
      {
        label: 'Returned Search Console queries',
        source: 'search-analytics',
        role: 'Provides the exact wording, impressions, clicks, and date range behind each match.',
      },
      {
        label: 'Documented phrase categories',
        role: 'Defines explicit forum, review, comparison, recommendation, and experience patterns.',
      },
    ],
    checks: [
      'Classifies eligible query wording with explicit repeatable phrase rules.',
      'Ranks matches by returned evidence and keeps ambiguous or unmatched wording outside the result.',
    ],
    returns: [
      'Matched queries grouped by phrase category with clicks, impressions, CTR, position, and source dates.',
      'A limited content review list with caveats for ambiguous wording and anonymised lower-volume queries.',
    ],
    seo: {
      title: 'Community Search Intent: Find Reviews and Comparisons in GSC',
      description:
        'Find Search Console queries with review, forum, comparison, recommendation, or experience wording and turn them into a grounded content review list.',
      heading: 'Find searches asking for reviews, comparisons, and experience',
    },
  },
  'compare-crawls': {
    name: 'Compare two saved crawls',
    summary:
      'See which pages, issues, and technical scores appeared, disappeared, or changed between two saved crawl snapshots.',
    lead: 'Use this when both crawl snapshots already exist and you need a repeatable release or progress comparison. The report checks whether their scopes are comparable before presenting changes.',
    inputs: [
      {
        label: 'Earlier saved crawl report',
        role: 'Provides the baseline pages, issues, scores, config, limits, and source status.',
      },
      {
        label: 'Later saved crawl report',
        role: 'Provides the current snapshot and its own scope, caps, failures, and evidence.',
      },
    ],
    checks: [
      'Compares crawl configuration, scope, completion, caps, and source status before treating totals as comparable.',
      'Diffs pages, issue instances, grouped rules, scores, and summary counts with stable ordering.',
    ],
    returns: [
      'New, resolved, and persistent page and issue changes with before and after summary values.',
      'A plain-language headline, comparability status, warnings, and caveats for scope or completeness differences.',
    ],
    seo: {
      title: 'Compare SEO Crawls: Find New, Fixed, and Changed Issues',
      description:
        'Compare two saved SEO crawl reports, find new and resolved issues, inspect changed pages and scores, and see whether both crawl scopes are comparable.',
      heading: 'Compare two saved crawls and see exactly what changed',
    },
  },
  'content-optimization': {
    name: 'Build a content optimization brief',
    summary:
      'Create a focused brief for one existing page from its own search queries and the content observed on the live URL.',
    lead: 'Use this when a page already has search visibility and needs a careful review. It separates technical conflicts from content ideas and never asks you to force every query phrase into the page.',
    inputs: [
      {
        label: 'Exact-page Search Console queries',
        source: 'search-analytics',
        role: 'Provides the returned demand, clicks, impressions, CTR, and position associated with the URL.',
      },
      {
        label: 'Live page content and technical evidence',
        source: 'javascript',
        role: 'Provides current metadata, headings, text, links, canonical, and indexability observations.',
      },
    ],
    checks: [
      'Ranks eligible query evidence and compares it with the fetched page within explicit limits.',
      'Separates technical conflicts, observed coverage, and heuristic content review ideas before building the brief.',
    ],
    returns: [
      'A limited edit brief with source queries, page observations, technical blockers, and supported review actions.',
      'Explicit heuristic labels, source completeness, failed verification, caveats, and a measurement follow-up.',
    ],
    seo: {
      title: 'SEO Content Optimization Brief: Use Real Search Queries',
      description:
        'Build a content optimization brief for one page from its Search Console queries and live content, with technical conflicts and heuristic ideas kept clear.',
      heading: 'Build a content brief from the searches a page already sees',
    },
  },
  'crawl-diff': {
    name: 'Monitor crawl changes',
    summary:
      'Crawl the same limited URL scope again and find technical or page changes since the previous monitoring run.',
    lead: 'Use this for repeatable regression checks where the tool should fetch the current pages itself. Keep the scope stable between runs so changes describe the site rather than a different sample.',
    inputs: [
      {
        label: 'Current limited same-origin crawl',
        role: 'Provides live responses, page evidence, issues, failures, limits, and crawl configuration.',
      },
      {
        label: 'Previous compatible monitoring snapshot',
        role: 'Provides the baseline for page and technical comparisons.',
      },
    ],
    checks: [
      'Crawls the requested URL set within the same-origin, depth, page, and fetch limits.',
      'Compares the current result with the previous run and separates regressions, recoveries, changes, failures, and scope differences.',
    ],
    returns: [
      'Current crawl evidence plus new, resolved, and changed technical or page findings.',
      'A saved comparison snapshot, data status, warnings, and caveats for caps, failures, and non-comparable scope.',
    ],
    seo: {
      title: 'SEO Crawl Monitoring: Find Technical Changes After a Release',
      description:
        'Run a limited crawl against the previous monitoring snapshot and find technical regressions, recoveries, page changes, failures, and scope differences.',
      heading: 'Run a fresh crawl and find technical changes since last time',
    },
  },
  'site-crawl': {
    name: 'Crawl a site for technical SEO issues',
    summary:
      'Map a limited part of a site, run the maintained technical checks, and save a reusable evidence baseline.',
    lead: 'This is the starting point for a technical site audit. It follows same-origin links and optional sitemaps within explicit limits, then turns fetched page evidence into grouped findings and follow-up reports.',
    inputs: [
      {
        label: 'Live site responses and discovered links',
        source: 'crawlable-links',
        role: 'Provides the limited page set, redirects, response evidence, links, metadata, directives, and content extraction.',
      },
      {
        label: 'robots.txt and sitemap discovery',
        source: 'robots',
        role: 'Controls allowed fetches and adds eligible sitemap URLs when enabled.',
      },
      {
        label: 'Optional Search Console and GA4 joins',
        source: 'search-analytics',
        role: 'Adds available first-party value to fetched landing pages without filling missing rows with zero.',
      },
    ],
    checks: [
      'Fetches and extracts pages within the configured origin, depth, page, rate, inclusion, exclusion, robots, sitemap, and JavaScript settings.',
      'Runs maintained response, redirect, canonical, indexability, metadata, heading, link, structured-data, international, security, mobile, and content observations.',
    ],
    returns: [
      'A compact technical summary with crawl status, page totals, grouped issues, top fixes, warnings, caveats, and source coverage.',
      'Optional limited page and issue inventories plus a local report id for comparisons and focused follow-ups.',
    ],
    seo: {
      title: 'Technical SEO Site Crawl: Find Issues and Save a Baseline',
      description:
        'Crawl a limited part of your site, check technical SEO evidence, rank practical fixes, and save a local baseline for focused reports and comparisons.',
      heading: 'Crawl your site and turn technical evidence into a fix plan',
    },
  },
  'ctr-underperformers': {
    name: 'Find weak CTR evidence',
    summary:
      'Find high-impression queries whose CTR trails a documented expectation and review the search result before changing anything.',
    lead: 'Use this to narrow a large Search Console export to queries worth a snippet and SERP review. CTR expectations are comparison heuristics, not Google targets or click forecasts.',
    inputs: [
      {
        label: 'Returned Search Console query rows',
        source: 'search-analytics',
        role: 'Provides impressions, clicks, CTR, average position, dates, and property scope.',
      },
      {
        label: 'Documented CTR expectation',
        role: 'Defines the position-aware benchmark and minimum evidence used to create the review set.',
      },
    ],
    checks: [
      'Filters eligible high-impression queries and compares observed CTR with the documented expectation.',
      'Ranks the shortfall consistently while keeping position, returned-row coverage, thresholds, and limits visible.',
    ],
    returns: [
      'A query review list with observed CTR, expected CTR, position, impressions, clicks, and estimated shortfall.',
      'Methodology and caveats that prevent the expectation or shortfall being read as a requirement or traffic promise.',
    ],
    seo: {
      title: 'CTR Underperformers: Find Search Queries Worth Reviewing',
      description:
        'Find high-impression Search Console queries with weak CTR evidence, compare them with a documented expectation, and review the live search result first.',
      heading: 'Find high-impression searches with weak CTR evidence',
    },
  },
  'decaying-pages': {
    name: 'Find declining search pages and queries',
    summary:
      'Find returned page and query rows with supported click declines across two matched Search Console windows.',
    lead: 'Use this when organic traffic appears to be slipping and you need to locate the affected pages or searches. The report only calls a decline where both returned windows support the comparison.',
    inputs: [
      {
        label: 'Two matched finalised Search Console windows',
        source: 'search-analytics',
        role: 'Provides comparable page and query rows with clicks, impressions, CTR, and average position.',
      },
      {
        label: 'Optional live-page verification',
        role: 'Adds current technical and content observations for a limited set of declining pages.',
      },
    ],
    checks: [
      'Aggregates duplicate returned rows and compares matched page and query evidence across equal windows.',
      'Ranks supported click declines and keeps unmatched, partial, filtered, capped, and failed verification states separate.',
    ],
    returns: [
      'Declining pages and queries with before and after metrics, absolute movement, percentage movement, and source dates.',
      'Investigation signals, optional page evidence, completeness, caveats, and no claim about why the decline happened.',
    ],
    seo: {
      title: 'SEO Content Decay: Find Pages and Queries Losing Clicks',
      description:
        'Find pages and queries losing Search Console clicks across matched finalised windows, then inspect position, CTR, demand, and live-page evidence.',
      heading: 'Find where Search Console clicks are declining',
    },
  },
  'setup-check': {
    name: 'Check your local SEO setup',
    summary:
      'Find local Google sign-in, scope, configuration, and saved project problems before they cause empty or failed reports.',
    lead: 'Run this when setup is incomplete or a Google-backed report fails unexpectedly. The checks stay on your machine and tell you exactly which local setting needs attention.',
    inputs: [
      {
        label: 'Local SEO configuration and paths',
        role: 'Provides the config directory, saved defaults, OAuth client source, and project settings.',
      },
      {
        label: 'Local Google token and granted scopes',
        role: 'Shows whether sign-in exists and includes the read-only Search Console and Analytics scopes.',
      },
    ],
    checks: [
      'Checks the local config directory, shared or bring-your-own OAuth client, token client compatibility, and Google sign-in.',
      'Checks read-only scopes and saved Search Console or GA4 defaults without sending credentials anywhere.',
    ],
    returns: [
      'A pass, warning, or failure for each local setup check with the observed path or state.',
      'A specific local command for every failed check that has a supported fix.',
    ],
    seo: {
      title: 'SEO CLI Setup Check: Fix Google Login and Configuration',
      description:
        'Check local SEO CLI configuration, Google login, OAuth client, read-only scopes, and saved properties, then get an exact fix for each failed check.',
      heading: 'Check your local SEO setup and fix what is missing',
    },
  },
  'entity-readiness': {
    name: 'Check entity and publisher signals',
    summary:
      'Review naming, authorship, dates, schema, and sameAs links without claiming a search engine has recognised an entity.',
    lead: 'Use this to find inconsistent or missing identity evidence across crawled pages. The report describes what is present and connected, then leaves search-engine recognition as unknown.',
    inputs: [
      {
        label: 'Saved or fresh crawl extraction',
        role: 'Provides page names, authors, publication dates, social links, and structured-data entities.',
      },
      {
        label: 'Structured data and sameAs evidence',
        source: 'structured-data',
        role: 'Provides observed organisation, person, article, profile, and external identity references.',
      },
    ],
    checks: [
      'Reviews repeated site and publisher naming, author and date evidence, supported schema types, and sameAs links.',
      'Separates missing, inconsistent, invalid, and merely optional signals without producing an entity score.',
    ],
    returns: [
      'Observed entity and publisher signals with representative pages, schema types, names, authors, dates, and sameAs links.',
      'Limited gaps and verification steps with explicit caveats about search-engine understanding and eligibility.',
    ],
    seo: {
      title: 'SEO Entity Signals: Check Schema, Authors, and sameAs Links',
      description:
        'Check entity and publisher signals across a crawl, including names, authors, dates, schema, and sameAs links, without claiming search-engine recognition.',
      heading: 'Check the entity and publisher signals present on your site',
    },
  },
  'explain-crawl-issue': {
    name: 'Understand a crawler issue',
    summary:
      'Turn one crawler rule id into plain-English meaning, practical fixes, impact context, and a repeatable verification step.',
    lead: 'Use this when a crawl finding is unfamiliar or too terse to act on. The explanation comes from the maintained local rule catalog, not generated guesses about the affected site.',
    inputs: [
      {
        label: 'Crawler rule id',
        role: 'Selects one maintained technical rule from the installed SEO package.',
      },
      {
        label: 'Versioned rule guidance',
        role: 'Provides the rule meaning, rationale, fix, impact context, and verification guidance.',
      },
    ],
    checks: [
      'Resolves the exact rule id against the current local crawler catalog.',
      'Returns maintained guidance and fails clearly when the id is unknown.',
    ],
    returns: [
      'A plain-English explanation of what the crawler observed and why the rule may matter.',
      'Practical fix, impact, and verification guidance that can be paired with affected URLs from a real crawl.',
    ],
    seo: {
      title: 'Explain an SEO Crawl Issue: Meaning, Fix, and Verification',
      description:
        'Explain any SEO crawler rule in plain English, see why it may matter, get practical fix guidance, and learn how to verify the result after a change.',
      heading: 'Understand what a crawler issue means and how to verify it',
    },
  },
  'geo-gaps': {
    name: 'Check Google AI search controls',
    summary:
      'Find crawl, indexability, and snippet controls that can block Google AI search eligibility on selected pages.',
    lead: 'Google says its normal crawl, index, and snippet controls also govern eligibility for AI search features. This report checks those controls and keeps optional page observations separate.',
    inputs: [
      {
        label: 'Saved or fresh crawl evidence',
        role: 'Provides response, robots, indexability, canonical, and page-level snippet controls.',
      },
      {
        label: 'Google AI feature guidance',
        source: 'ai-features',
        role: 'Defines the supported relationship between normal search controls and AI feature eligibility.',
      },
    ],
    checks: [
      'Checks fetched pages for crawl blocks, noindex, unusable responses, canonical conflicts, nosnippet, and max-snippet restrictions.',
      'Lists optional page observations separately and never treats their absence as a visibility defect.',
    ],
    returns: [
      'Pages with observed technical eligibility restrictions and the exact crawl, index, canonical, or snippet evidence.',
      'Selection limits, data status, optional observations, warnings, and a clear statement that eligibility does not guarantee selection.',
    ],
    seo: {
      title: 'Google AI Search Controls: Find Crawl and Snippet Blocks',
      description:
        'Check crawl, indexability, canonical, nosnippet, and max-snippet controls that affect Google AI search eligibility without predicting selection.',
      heading:
        'Find technical controls that can block Google AI search eligibility',
    },
  },
  'crawl-report': {
    name: 'Open a saved crawl report',
    summary:
      'Retrieve one local crawl snapshot in compact form and request its page or issue inventory only when you need it.',
    lead: 'Use this to continue work from an existing crawl instead of fetching the site again. The compact response keeps context small while preserving the report id, scope, status, and caveats.',
    inputs: [
      {
        label: 'Saved crawl report id or site',
        role: 'Selects one local snapshot directly or chooses the latest report for a property.',
      },
      {
        label: 'Optional detail flags',
        role: 'Adds the limited page or issue inventory when the compact summary is not enough.',
      },
    ],
    checks: [
      'Loads the exact local report id or resolves the latest saved report for the optional site.',
      'Returns compact evidence by default and includes large page or issue arrays only when explicitly requested.',
    ],
    returns: [
      'Saved crawl metadata, configuration, summary, source status, top-level warnings, caveats, and report id.',
      'Optional page and issue inventories from the same snapshot with no fresh network requests.',
    ],
    seo: {
      title: 'Saved SEO Crawl Report: Open a Local Snapshot by ID Locally',
      description:
        'Open a saved local SEO crawl report by id or site, read the compact summary first, and request page or issue details without crawling the site again.',
      heading: 'Open a saved crawl without fetching the site again',
    },
  },
}
