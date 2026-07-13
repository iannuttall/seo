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
    alternatives: [
      {
        when: 'You know several crawl issues exist but need to decide which ones deserve attention first.',
        reportId: 'top-fixes',
        doInstead:
          'Run top fixes. It compares issue severity, affected-page counts, and available search or analytics value so you get a ranked work list rather than the URLs for one chosen issue.',
      },
      {
        when: 'You do not yet understand what a crawler rule means or whether its suggested fix applies to your site.',
        reportId: 'explain-crawl-issue',
        doInstead:
          'Explain the crawl issue first. It adds the maintained rule meaning, rationale, fix, and verification method. Then return here when you are ready to inspect the real affected URLs.',
      },
    ],
    seo: {
      title: 'Technical SEO Issues: Find Every Affected URL From a Crawl',
      description:
        'Find every URL affected by specific technical SEO issues, inspect the crawl evidence, and turn a summary count into a practical review list.',
      heading: 'Find the URLs behind your technical SEO issues',
      primaryKeyword: 'technical SEO issues',
      supportingKeywords: [],
    },
  },
  'ai-readiness': {
    name: 'Check AI search technical readiness',
    summary:
      'Review crawl access, indexability, snippet controls, page structure, and optional agent resources without inventing an AI visibility score.',
    lead: 'Use this broad AI search audit to check whether technical controls could prevent important pages from being crawled, indexed, or used with snippets. It cannot predict selection, citations, rankings, or traffic from an AI product.',
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
    alternatives: [
      {
        when: 'You only need to check the Google crawl, index, canonical, and snippet controls used for AI feature eligibility.',
        reportId: 'geo-gaps',
        doInstead:
          'Run Google AI search controls. It narrows the evidence to Google-supported technical eligibility controls and leaves optional page observations outside the blocker list.',
      },
      {
        when: 'You need to know whether an AI product will cite, mention, rank, or send traffic to a page.',
        doInstead:
          'No automated report in this package can decide that. Check the relevant AI products with a repeatable external monitoring method and review their returned answers and citations. This report can still identify technical controls that may prevent eligibility.',
      },
    ],
    seo: {
      title: 'AI Search Readiness Report: Crawl Access and Citation Signals',
      description:
        'Check whether AI search engines and agents can access, parse, understand, and cite important pages from your crawl.',
      heading:
        'AI search readiness report for crawl access and citation signals.',
      primaryKeyword: 'ai search optimization',
      supportingKeywords: ['ai search readiness', 'seo ai tools'],
    },
  },
  'ai-referrals': {
    name: 'Find AI referral traffic',
    summary:
      'See which known AI products sent referral sessions recorded by GA4 and which landing pages received them.',
    lead: 'Use this to check whether known AI assistants are already sending traffic and which landing pages receive it. This is observed GA4 referral traffic, not an estimate of AI visibility.',
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
    alternatives: [
      {
        when: 'You want to know whether important pages are technically available to AI search systems, regardless of whether GA4 recorded a visit.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI readiness. It checks crawl, index, snippet, and page-structure evidence that referral analytics cannot see.',
      },
      {
        when: 'You need to know whether assistants mention or cite the site even when nobody clicks through.',
        doInstead:
          'No automated report in this package measures unclicked mentions or citations. Use repeatable external prompt monitoring and inspect the answers and cited URLs. AI referrals can only confirm visits that reached GA4 with a recognisable source.',
      },
    ],
    seo: {
      title: 'AI Referral Traffic Report: Find Assistant Visits in GA4',
      description:
        'Find AI assistant referral traffic in GA4 and see which sources, pages, and sessions are already showing up in analytics.',
      heading: 'AI referral traffic report for assistant visits in GA4.',
      primaryKeyword: 'ai referrals',
      supportingKeywords: ['ga4 report', 'ai search optimization'],
    },
  },
  'ai-search-scorecard': {
    name: 'Score AI search readiness',
    summary:
      "Turn one crawl into a 0-100 heuristic score over this tool's own AI-search checks, with observed evidence and unknown states kept separate.",
    lead: "Use this to summarise the AI-search technical evidence the crawler already collects into a single scored read. The score is this tool's own heuristic, not a Google or AI-engine requirement, an eligibility verdict, a ranking predictor, or proof of citations.",
    inputs: [
      {
        label: 'Saved or fresh crawl report',
        source: 'ai-features',
        role: 'Provides response, robots, indexability, structured data, entity, and page-structure evidence for each check.',
      },
      {
        label: 'Fixed check weights and status credit',
        role: "Define this tool's own scoring, published in the output as an id, version, weight map, and formula.",
      },
    ],
    checks: [
      'Scores the start-URL AI crawler policy, HTTPS, indexable share, structured data, JSON-LD validity, entity sameAs, and opening-content structure.',
      'Records each check as pass, warn, fail, or unknown, and excludes unknown checks from the score instead of counting them as failures.',
    ],
    returns: [
      'A 0-100 heuristic score with per-check observed evidence, a derived finding, and a bounded verification step.',
      'A partial flag, an excluded list, and the methodology id, version, weights, and formula for reproduction.',
    ],
    alternatives: [
      {
        when: 'You want the underlying access, indexability, and snippet evidence rather than a single number.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI search readiness. It returns the evidence-only assessment this scorecard summarises, with no aggregate score.',
      },
      {
        when: 'You need Google-specific crawl, index, canonical, and snippet controls for AI feature eligibility.',
        reportId: 'geo-gaps',
        doInstead:
          'Run Google AI search controls. It narrows the evidence to supported technical eligibility controls per page.',
      },
    ],
    seo: {
      title: 'AI Search Scorecard: Score Crawl Readiness 0 to 100',
      description:
        "Score AI-search technical readiness from one crawl. This tool's own weighted checks summarise into a 0 to 100 heuristic, not a search-engine verdict.",
      heading: 'AI search scorecard for crawl-based readiness scoring.',
      primaryKeyword: 'ai search scorecard',
      supportingKeywords: ['ai search readiness', 'ai search optimization'],
    },
  },
  'audit-page': {
    name: 'Audit one page',
    summary:
      'Inspect one live URL before changing its metadata, canonical, directives, structured data, links, or content.',
    lead: 'Use this when you need page-level evidence before changing a title, canonical, internal link, or indexing control. The report fetches the live URL and keeps title width, heading counts, and content length as evidence rather than universal quality rules.',
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
    alternatives: [
      {
        when: 'You need to discover the same technical problem across a whole site rather than inspect one known URL.',
        reportId: 'site-crawl',
        doInstead:
          'Run a site crawl. It follows eligible links and sitemaps within explicit limits, groups repeated findings, and saves a reusable site-level baseline.',
      },
      {
        when: 'The page is technically sound and you need a Search Console-backed brief for improving its existing content.',
        reportId: 'content-optimization',
        doInstead:
          'Run content optimization. It joins the live page with its returned queries and separates technical conflicts from supported content review ideas.',
      },
    ],
    seo: {
      title: 'SEO Page Audit: Check One URL With Crawl and GSC Evidence',
      description:
        'Audit one URL for technical SEO, metadata, content evidence, schema, links, canonicals, and Search Console query data.',
      heading:
        'SEO page audit for one URL with crawl and Search Console evidence.',
      primaryKeyword: 'seo page audit',
      supportingKeywords: ['seo audit', 'google search console seo'],
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
    alternatives: [
      {
        when: 'You do not know which URLs are affected and need the crawler to discover pages from links and sitemaps.',
        reportId: 'site-crawl',
        doInstead:
          'Run a site crawl. It discovers an explicitly limited same-origin page set before applying the technical checks. A selected-URL audit never widens the supplied list.',
      },
      {
        when: 'You already saved two crawl reports and need to compare new, resolved, and changed findings.',
        reportId: 'compare-crawls',
        doInstead:
          'Compare the saved crawls. It checks whether both scopes are comparable and then reports page, issue, score, and summary movement between the two snapshots.',
      },
    ],
    seo: {
      title: 'Bulk SEO Checker: Audit a Selected List of URLs at Once',
      description:
        'Use a bulk SEO checker to audit an exact list of URLs for launch checks, template samples, migrations, and post-fix verification.',
      heading: 'Check a list of URLs without crawling the whole site',
      primaryKeyword: 'bulk SEO checker',
      supportingKeywords: ['bulk URL checker'],
    },
  },
  cannibalisation: {
    name: 'Review query overlap and cannibalisation',
    summary:
      'Find queries associated with several URLs and separate healthy search coverage from genuine intent, canonical, or consolidation problems.',
    lead: 'Use this to find duplicate intent, pages that swap visibility for the same query, or overlapping scaled content. Multiple URLs appearing for one query is not automatically cannibalisation, so the report keeps the overlap, metrics, and page evidence visible.',
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
    alternatives: [
      {
        when: 'You need to find relevant pages that could link to one chosen target URL rather than investigate several URLs shown for the same query.',
        reportId: 'internal-links',
        doInstead:
          'Run internal links. It uses related Search Console query evidence and live link checks to find candidate source pages for the target.',
      },
      {
        when: 'You need a final decision to merge, redirect, canonicalise, or keep the overlapping pages separate.',
        doInstead:
          'No automated report can decide page intent, business value, or the preferred information architecture. Review the live pages, SERP intent, conversions, backlinks, and ownership of each topic. This report can still supply the overlap and first-party metrics for that review.',
      },
    ],
    seo: {
      title: 'Keyword Cannibalization Report: Find Competing URLs',
      description:
        'Find keyword cannibalization in Search Console and see which URLs compete, split impressions, or need clearer intent.',
      heading:
        'Keyword cannibalization report for competing URLs on your site.',
      primaryKeyword: 'keyword cannibalization',
      supportingKeywords: [
        'seo cannibalization',
        'keyword cannibalization tool',
      ],
    },
  },
  'community-intent': {
    name: 'Find community and comparison searches',
    summary:
      'Surface searches containing explicit review, comparison, forum, recommendation, or first-hand experience wording.',
    lead: 'Use this to find searches that may need opinions, comparisons, reviews, or first-hand experience rather than a normal landing page. The phrase classifier creates a review hypothesis, not a complete model of intent.',
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
    alternatives: [
      {
        when: 'You want broader repeated query themes and content gaps, not only searches containing community or comparison wording.',
        reportId: 'query-clusters',
        doInstead:
          'Run query clusters. It groups the returned Search Console demand into repeated themes without requiring the explicit phrase patterns used here.',
      },
      {
        when: 'You need to decide whether a page should contain first-hand experience, reviews, comparisons, or a discussion format.',
        doInstead:
          'No automated report can judge whether you have credible experience or which editorial format will satisfy the searcher. Review representative results, the existing page, and the evidence your business can genuinely provide. This report can still select the query wording and current ranking pages for that review.',
      },
    ],
    seo: {
      title: 'Community Intent Report: Find Forum and Review Queries',
      description:
        'Find Search Console queries with forum, review, comparison, Reddit, and discussion intent so content can match real demand.',
      heading:
        'Community intent report for forum, review, and comparison queries.',
      primaryKeyword: 'community intent',
      supportingKeywords: ['search console queries', 'content optimization'],
    },
  },
  'compare-crawls': {
    name: 'Compare two saved crawls',
    summary:
      'See which pages and technical issues appeared, disappeared, or changed between two saved crawl snapshots.',
    lead: 'Use this when both crawl snapshots already exist and you need a repeatable release or progress comparison. The report checks whether their scopes are comparable before presenting changes.',
    inputs: [
      {
        label: 'Earlier saved crawl report',
        role: 'Provides the baseline pages, issues, config, limits, and source status.',
      },
      {
        label: 'Later saved crawl report',
        role: 'Provides the current snapshot and its own scope, caps, failures, and evidence.',
      },
    ],
    checks: [
      'Compares crawl configuration, scope, completion, caps, and source status before treating totals as comparable.',
      'Diffs pages, issue instances, grouped rules, and summary counts with stable ordering.',
    ],
    returns: [
      'New, resolved, and persistent page and issue changes with before and after summary values.',
      'A plain-language headline, comparability status, warnings, and caveats for scope or completeness differences.',
    ],
    alternatives: [
      {
        when: 'You have one saved baseline but still need to fetch the current site before comparing it.',
        reportId: 'crawl-diff',
        doInstead:
          'Run crawl diff. It fetches the current limited scope, compares it with the compatible monitoring snapshot, and keeps failures or scope changes separate from real regressions.',
      },
      {
        when: 'You need to know which release, edit, or external event caused a crawl change.',
        doInstead:
          'No automated report can prove the cause from two crawl snapshots. Compare deployment records, source changes, server logs, and the affected page templates. This report can still identify when the evidence changed and which URLs or rules need that investigation.',
      },
    ],
    seo: {
      title: 'SEO Crawl Comparison: Find New, Fixed, and Changed Issues',
      description:
        'Compare two saved SEO crawl reports, find new and resolved issues, inspect changed pages and scores, and see whether both crawl scopes are comparable.',
      heading: 'Compare two saved crawls and see exactly what changed',
      primaryKeyword: 'SEO crawl',
      supportingKeywords: [],
    },
  },
  'content-optimization': {
    name: 'Build a content optimization brief',
    summary:
      'Create a focused brief for one existing page from its own search queries and the content observed on the live URL.',
    lead: 'Use this to improve an existing page with the Search Console demand it already earns. It finds missing subtopics, answer gaps, and search-result framing issues while keeping technical conflicts separate from content ideas.',
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
    alternatives: [
      {
        when: 'You only need a technical check of one live URL before changing its metadata, canonical, directives, links, or schema.',
        reportId: 'audit-page',
        doInstead:
          'Run the page audit. It focuses on observed live-page evidence and does not build a content brief from query demand.',
      },
      {
        when: 'You need to decide whether to rewrite the current page, create a new page, merge it with another page, or leave it alone.',
        doInstead:
          'No automated report can make that editorial and information-architecture decision. Review search intent, the live SERP, conversions, backlinks, business goals, and overlapping pages. This report can still provide the page evidence and returned queries used in that decision.',
      },
    ],
    seo: {
      title: 'Content Optimization Report: Build a Brief From GSC Data',
      description:
        'Build a content optimization brief from Search Console queries, page evidence, headings, titles, and missing coverage.',
      heading:
        'Content optimization report built from Search Console and page evidence.',
      primaryKeyword: 'content optimization',
      supportingKeywords: [
        'seo content optimization',
        'google search console keywords',
      ],
    },
  },
  'crawl-diff': {
    name: 'Monitor crawl changes',
    summary:
      'Crawl the same limited URL scope again and find technical or page changes since the previous monitoring run.',
    lead: 'Use this after a release or SEO sprint to find new issues, fixed issues, and changed pages. It fetches the current scope itself, so keep that scope stable between runs or the comparison will describe a different sample.',
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
    alternatives: [
      {
        when: 'Both crawl snapshots already exist and you need to choose the exact earlier and later report IDs yourself.',
        reportId: 'compare-crawls',
        doInstead:
          'Compare the saved crawls. It reads both local snapshots without fetching the site and checks their configuration and completeness before presenting changes.',
      },
      {
        when: 'There is no compatible baseline yet and you need the first technical snapshot.',
        reportId: 'site-crawl',
        doInstead:
          'Run a site crawl and save it as the baseline. A change report cannot identify regressions from a single snapshot, but the saved crawl gives the next run something comparable.',
      },
    ],
    seo: {
      title: 'SEO Crawl Diff: Compare Technical SEO Changes After a Release',
      description:
        'Compare two saved crawls and see which technical SEO issues were added, fixed, or changed after a release or SEO sprint.',
      heading:
        'SEO crawl diff for release checks and technical SEO regressions.',
      primaryKeyword: 'seo crawl',
      supportingKeywords: ['technical SEO audit', 'site audit'],
    },
  },
  'site-crawl': {
    name: 'Technical SEO site crawl audit',
    summary:
      'Find technical SEO issues across a site and save the crawl for follow-up audits.',
    lead: 'Find technical SEO issues across your site and see which pages need attention. Save the crawl as a baseline for follow-up audits.',
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
    alternatives: [
      {
        when: 'The question is about one known URL and you do not need page discovery or a site-level baseline.',
        reportId: 'audit-page',
        doInstead:
          'Run the page audit. It fetches one URL and returns focused response, metadata, canonical, directive, link, structured-data, and content evidence.',
      },
      {
        when: 'Clicks or impressions changed and you need to find which pages, queries, countries, or devices explain the movement.',
        reportId: 'search-performance-overview',
        doInstead:
          'Run the search performance overview. It compares Search Console evidence and points to the segments and focused reports behind the movement. A crawl cannot explain search demand by itself.',
      },
    ],
    seo: {
      title: 'Technical SEO Site Crawl Audit',
      description:
        'Run a technical SEO site crawl audit to find crawl, indexing, link and metadata issues. See affected pages and save a baseline for follow-up checks.',
      heading: 'Technical SEO site crawl audit',
      primaryKeyword: 'technical SEO audit',
      supportingKeywords: ['seo site audit', 'seo crawler', 'website audit'],
    },
  },
  'ctr-underperformers': {
    name: 'Find weak CTR evidence',
    summary:
      'Find high-impression queries whose CTR trails a documented expectation and review the search result before changing anything.',
    lead: 'Use this to find titles and snippets that may be underselling pages with useful rankings. It compares page and query CTR with a documented benchmark, but the benchmark is a review heuristic rather than a Google target or click forecast.',
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
    alternatives: [
      {
        when: 'The main opportunity is queries averaging positions 11 to 20 rather than weak CTR at an existing position.',
        reportId: 'second-page',
        doInstead:
          'Run second-page opportunities. It groups the returned page and query evidence near page one without treating the average position as a fixed rank.',
      },
      {
        when: 'You need to know whether changing a title or snippet actually improved clicks or CTR.',
        reportId: 'measure-change',
        doInstead:
          'Record and measure the change across matched Search Console windows. It adds before-and-after evidence, but it still cannot isolate the edit from demand, ranking, SERP, or seasonality changes.',
      },
    ],
    seo: {
      title: 'CTR Optimization Report: Find Search Snippets Losing Clicks',
      description:
        'Find Search Console rows where CTR is weak for the ranking position, then improve title tags, snippets, and SERP framing.',
      heading: 'CTR optimization report for search snippets losing clicks.',
      primaryKeyword: 'ctr optimization',
      supportingKeywords: ['google search console seo', 'seo quick wins'],
    },
  },
  'decaying-pages': {
    name: 'Find declining search pages and queries',
    summary:
      'Find returned page and query rows with supported click declines across two matched Search Console windows.',
    lead: 'Use this to find pages or queries that recently lost meaningful clicks and separate position movement from CTR or demand changes. It builds a recovery list from matched Search Console evidence, not publication dates.',
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
    alternatives: [
      {
        when: 'Search performance changed but you do not yet know whether the movement is a decline, which segment moved, or where to start.',
        reportId: 'search-performance-overview',
        doInstead:
          'Run the search performance overview. It checks broader movement and breaks it down by page, query, country, and device before recommending a focused follow-up.',
      },
      {
        when: 'You need a definitive explanation for why a page lost clicks.',
        doInstead:
          'No automated report can isolate the cause from Search Console rows. Review the live page, competing results, demand, release history, tracking, links, and known Google updates. This report can still identify the affected pages, dates, and whether position, CTR, or impressions moved with the loss.',
      },
    ],
    seo: {
      title: 'SEO Content Decay Report: Find Pages Losing GSC Clicks',
      description:
        'Compare two Search Console windows and find pages or queries losing clicks, rankings, CTR, or search visibility.',
      heading:
        'SEO content decay report for pages losing Search Console clicks.',
      primaryKeyword: 'content decay SEO',
      supportingKeywords: ['decaying content', 'google search console seo'],
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
    alternatives: [
      {
        when: 'Google sign-in and the local project are working and you need to find SEO problems on the site itself.',
        reportId: 'site-crawl',
        doInstead:
          'Run a site crawl. It fetches site evidence and applies the technical checks. Setup check only verifies the local configuration and access needed to run other reports.',
      },
      {
        when: 'The setup checks pass but a provider still returns missing, delayed, partial, or unexpected data.',
        doInstead:
          'No automated setup report can recover data that the provider did not return. Review the selected property, date range, provider limits, Google account access, and the report source status. Setup check can confirm local credentials and scopes, but it cannot make unavailable rows appear.',
      },
    ],
    seo: {
      title: 'SEO CLI Setup Check: Fix Google Login and Configuration',
      description:
        'Check local SEO CLI configuration, Google login, OAuth client, read-only scopes, and saved properties, then get an exact fix for each failed check.',
      heading: 'Check your local SEO setup and fix what is missing',
      primaryKeyword: 'SEO CLI',
      supportingKeywords: [],
    },
  },
  'entity-readiness': {
    name: 'Check entity and publisher signals',
    summary:
      'Review naming, authorship, dates, schema, and sameAs links without claiming a search engine has recognised an entity.',
    lead: 'Use this to check Organization, Person, WebSite, Article, author, and sameAs signals across crawled pages. It finds weak or inconsistent identity evidence while leaving search-engine recognition as unknown.',
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
    alternatives: [
      {
        when: 'You need the broader crawl, index, snippet, page-structure, and optional resource checks used for AI search readiness.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI readiness. It adds technical access and page-level readiness evidence beyond the identity and publisher signals reviewed here.',
      },
      {
        when: 'You need proof that Google or an AI product has recognised a particular person, organisation, brand, or topic entity.',
        doInstead:
          "No automated report in this package can observe a search engine's internal entity understanding. Review visible search results, knowledge features, primary profiles, authoritative references, and structured-data validation. This report can still show which names, authors, schema types, and sameAs links are present or inconsistent.",
      },
    ],
    seo: {
      title: 'Entity SEO Audit: Check Schema, Authors and Brand Signals',
      description:
        'Check schema, authorship, sameAs links, organization data, and visible entity signals that help search engines understand the site.',
      heading: 'Entity SEO audit for schema, authors, and brand signals.',
      primaryKeyword: 'entity SEO',
      supportingKeywords: ['schema audit', 'ai search optimization'],
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
    alternatives: [
      {
        when: 'You understand the rule and need the real URLs, evidence, and first-party metrics behind that finding in a saved crawl.',
        reportId: 'affected-urls',
        doInstead:
          'Run affected URLs with the rule id. It turns the catalog explanation into a limited list of actual pages and keeps the selection count and truncation visible.',
      },
      {
        when: 'You need to know whether the observed condition is intentional for a particular page or template.',
        doInstead:
          'No automated rule explanation can know site intent. Review the page purpose, template rules, canonical plan, robots policy, and release context with the owner. This report can explain the condition and verification method, but it cannot label an intentional control as a defect.',
      },
    ],
    seo: {
      title: 'Technical SEO Issues: Meaning, Fixes and Verification',
      description:
        'Explain technical SEO issues in plain English, see why each crawler rule may matter, get a practical fix, and learn how to verify the result.',
      heading: 'Understand a technical SEO issue and how to fix it',
      primaryKeyword: 'technical SEO issues',
      supportingKeywords: [],
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
    alternatives: [
      {
        when: 'You want a broader AI readiness review that also covers page structure, structured data, and optional agent resources.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI readiness. It includes the supported Google controls and adds separate observations for structure and optional resources without treating them as visibility requirements.',
      },
      {
        when: 'You need to know whether Google will show a page in an AI Overview or how often it already appears there.',
        doInstead:
          'No automated report in this package measures AI Overview selection or visibility. Use repeatable external SERP monitoring for the target queries and inspect the cited pages. This report can still identify technical controls that may prevent eligibility.',
      },
    ],
    seo: {
      title: 'Google AI Overview SEO: Check Crawl and Snippet Controls',
      description:
        'Check the crawl, indexability, canonical, nosnippet, and max-snippet controls used for Google AI Overview SEO without predicting selection.',
      heading:
        'Check the technical controls behind Google AI Overview eligibility',
      primaryKeyword: 'Google AI Overview SEO',
      supportingKeywords: ['AI search optimization'],
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
    alternatives: [
      {
        when: 'You need current live evidence rather than the pages and issues stored in an earlier snapshot.',
        reportId: 'site-crawl',
        doInstead:
          'Run a new site crawl. It fetches the current limited scope and creates a new saved report instead of presenting stale evidence as current.',
      },
      {
        when: 'You need to see what changed between this saved report and another crawl snapshot.',
        reportId: 'compare-crawls',
        doInstead:
          'Compare the two saved crawls. It checks scope and completeness first, then reports new, resolved, persistent, and changed page or issue evidence.',
      },
    ],
    seo: {
      title: 'SEO Crawl Report: Reopen and Read a Saved Local Audit',
      description:
        'Open a saved SEO crawl report by id or site, read the compact summary, and request page or issue details without crawling the site again.',
      heading: 'Open a saved SEO crawl report without fetching the site again',
      primaryKeyword: 'SEO crawl report',
      supportingKeywords: ['SEO audit report'],
    },
  },
}
