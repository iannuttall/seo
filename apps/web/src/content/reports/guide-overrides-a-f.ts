import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesAF: Partial<
  Record<string, ReportGuideOverride>
> = {
  'affected-urls': {
    name: 'Find URLs affected by a crawl issue',
    summary:
      'Open the exact URLs behind a crawl finding and turn a summary count into a limited review or fix list.',
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
      'Affected URLs with rule id, severity, detail, evidence, and available Search Console or Google Analytics metrics.',
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
      primaryKeyword: 'technical SEO issues',
      supportingKeywords: [],
    },
  },
  'agent-readiness': {
    name: 'Check AI agent readiness',
    summary:
      'Check whether agents can find, fetch, and read a stable machine-readable version of every public content page.',
    inputs: [
      {
        label: 'Fresh content-site crawl',
        role: 'Provides the public HTML route inventory, response evidence, crawler policy, and structured identity found during this run.',
      },
      {
        label: 'Agent-facing representations and discovery',
        role: 'Provides Markdown alternatives, negotiated responses, the route manifest, Agent Skills, and llms.txt for direct validation.',
      },
    ],
    checks: [
      'Confirms that every successful public HTML page advertises one working Markdown alternative with a matching canonical relationship.',
      'Compares explicit and negotiated Markdown byte for byte, honours Accept q-values, and checks repeated response hashes for stability.',
      'Validates Agent Skills digests, llms.txt links, route-manifest coverage, crawler access, protocol handling, and the site identity graph.',
    ],
    returns: [
      'An unscored content-profile result with pass, warning, fail, unknown, information, and not-applicable states kept separate.',
      'Affected URLs, observed evidence, and a concrete action for every representation or discovery check that needs attention.',
      'Profile applicability showing that API, application, and commerce checks were outside this content-site run rather than failed.',
    ],
    alternatives: [
      {
        when: 'You want to check technical eligibility for Google AI search features rather than the machine-readable content contract.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI search readiness. It checks crawl, index, canonical, snippet, and page evidence without treating optional agent discovery as a search requirement.',
      },
      {
        when: 'You need observed mentions, citations, prompt coverage, or share of voice inside AI answers.',
        href: '/docs/ai-visibility',
        label: 'AI visibility tracking',
        doInstead:
          'Use a repeatable external visibility measurement. This audit can prove whether the site delivered its content contract, but it cannot show whether an AI product used it.',
      },
    ],
    seo: {
      primaryKeyword: 'AI agent readiness',
      supportingKeywords: ['markdown for AI agents', 'AI agent website audit'],
    },
  },
  'ai-readiness': {
    name: 'Check AI search technical readiness',
    summary:
      'Review crawl access, indexability, snippet controls, page structure, and optional agent resources without inventing an AI visibility score.',
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
        reportId: 'ai-mention-research',
        doInstead:
          'Run AI mention research for provider-indexed mention and citation evidence. Use fixed prompt observations for current answers and AI referrals for measured visits. None of those sources can guarantee future selection or ranking.',
      },
    ],
    seo: {
      primaryKeyword: 'ai search optimization',
      supportingKeywords: ['ai search readiness', 'seo ai tools'],
    },
  },
  'ai-referrals': {
    name: 'Find AI referral traffic',
    summary:
      'See which known AI products sent referral sessions recorded by Google Analytics and which landing pages received them.',
    inputs: [
      {
        label: 'Google Analytics traffic acquisition rows',
        source: 'google-analytics-acquisition',
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
      'AI referral sessions grouped by matched source and landing page with the requested Google Analytics date range.',
      'Returned-row limits and caveats for missing referrers, consent, redirects, attribution settings, and source changes.',
    ],
    alternatives: [
      {
        when: 'You want to know whether important pages are technically available to AI search systems, regardless of whether Google Analytics recorded a visit.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI readiness. It checks crawl, index, snippet, and page-structure evidence that referral analytics cannot see.',
      },
      {
        when: 'You need to know whether assistants mention or cite the site even when nobody clicks through.',
        reportId: 'ai-mention-research',
        doInstead:
          'Run AI mention research for provider-indexed mentions, questions, and cited URLs. Use fixed prompt observations when you need a current answer. AI referrals can only confirm visits that reached Google Analytics with a recognisable source.',
      },
    ],
    seo: {
      primaryKeyword: 'ai referrals',
      supportingKeywords: ['google analytics report', 'ai search optimization'],
    },
  },
  'ai-mention-research': {
    name: 'Research AI mentions and citations',
    summary:
      'Compare provider-indexed mentions, cited domains, and bounded question samples for one AI surface and market, then add Search Console overlap when you own the site.',
    inputs: [
      {
        label: 'Provider-indexed AI mention data',
        source: 'ai-mention-provider',
        role: 'Provides target metrics, cited source domains, question samples, observation dates, model names, and the exact surface and market.',
      },
      {
        label: 'Optional Search Console query rows',
        source: 'search-analytics',
        role: 'Adds bounded first-party query and landing-page evidence for a property you own.',
      },
      {
        label: 'Explicit target and comparison set',
        role: 'Defines one named target, its aliases, and at most five named competitors measured in the same provider request.',
      },
    ],
    checks: [
      'Keeps mention metrics and question samples in separate evidence states, so a failed sample request does not erase successful metrics.',
      'Calculates mention share only across supplied targets, marks cited URLs from an optional owned domain, and applies a bounded lexical overlap heuristic to retained Search Console rows.',
      'Reports cache status, price evidence, actual cost, provider task ids, row caps, invalid rows, processing bounds, warnings, and partial states.',
    ],
    returns: [
      'Target and competitor mention metrics, source-domain evidence, and at most 25 retained question samples for one surface, location, and language.',
      'Owned citation flags, optional first-party query matches, repeated question terms, cautious programmatic data-source briefs, findings, caveats, and next steps.',
    ],
    alternatives: [
      {
        when: 'You need the current answer for a fixed prompt rather than an indexed research dataset.',
        reportId: 'ai-prompt-observations',
        doInstead:
          'Run AI prompt observations. Keep the prompt, surface, requested and effective model, market label, settings, time, answer, and citations together so a later compatible observation can be compared.',
      },
      {
        when: 'You need measured visits from known AI products.',
        reportId: 'ai-referrals',
        doInstead:
          'Run AI referrals. It reads Google Analytics referral sessions and landing pages instead of inferring traffic from mention records.',
      },
      {
        when: 'You only need technical crawl, index, or snippet eligibility evidence.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI search readiness. It checks technical controls without claiming that an AI product mentioned or cited the site.',
      },
    ],
    seo: {
      primaryKeyword: 'ai mention tracking',
      supportingKeywords: [
        'ai citation tracking',
        'ai search visibility',
        'chatgpt mentions',
      ],
    },
  },
  'ai-search-scorecard': {
    name: 'Score AI search readiness',
    summary:
      "Turn one crawl into a 0-100 heuristic score over this tool's own AI-search checks, with observed evidence and unknown states kept separate.",
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
      primaryKeyword: 'ai search scorecard',
      supportingKeywords: ['ai search readiness', 'ai search optimization'],
    },
  },
  'audit-page': {
    name: 'Audit one page',
    summary:
      'Inspect one live URL before changing its metadata, canonical, directives, structured data, links, or content.',
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
      primaryKeyword: 'seo page audit',
      supportingKeywords: ['seo audit', 'google search console seo'],
    },
  },
  'audit-urls': {
    name: 'Audit selected URLs',
    summary:
      'Run the crawler checks across a chosen list of pages without discovering or crawling the rest of the site.',
    inputs: [
      {
        label: 'Explicit URL list',
        role: 'Defines the exact pages to fetch and the maximum scope of the audit.',
      },
      {
        label: 'Optional Search Console and Google Analytics project context',
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
      primaryKeyword: 'bulk SEO checker',
      supportingKeywords: ['bulk URL checker'],
    },
  },
  'bing-webmaster-overview': {
    name: 'Review Bing search and crawl evidence',
    summary:
      'Find bounded Bing traffic trends, crawl changes, and query and page opportunities without crawling page bodies.',
    inputs: [
      {
        label: 'Verified Bing Webmaster site',
        source: 'bing-webmaster',
        role: 'Defines the exact site and provider account evidence to request.',
      },
      {
        label: 'Local Bing credential',
        role: 'Authorizes the request without including the secret in report output.',
      },
    ],
    checks: [
      'Requests traffic, crawl, query, and page statistics in parallel with strict response, time, and row limits.',
      'Validates and orders provider rows, preserves invalid and capped counts, and keeps failed sections separate.',
      'Compares matched traffic periods and crawl snapshots without hiding missing dates.',
      'Compares movements only for query and page entries observed in every weekly top list in both periods and keeps incomplete coverage visible.',
    ],
    returns: [
      'Prioritized findings with observed evidence, cautious interpretation, and a verification step.',
      'Traffic trends, crawl changes, and bounded query and page opportunities with explicit provider coverage.',
    ],
    alternatives: [
      {
        when: 'You need Google search performance evidence for the same site.',
        reportId: 'search-performance-overview',
        doInstead:
          'Run the search performance overview. It uses Search Console evidence and keeps its provider scope separate from Bing.',
      },
      {
        when: 'You need to inspect current pages and technical findings rather than provider statistics.',
        reportId: 'site-crawl',
        doInstead:
          'Run a bounded site crawl. It fetches current page evidence and groups repeated technical findings.',
      },
    ],
    seo: {
      primaryKeyword: 'Bing Webmaster report',
      supportingKeywords: ['Bing crawl stats', 'Bing search traffic'],
    },
  },
  cannibalisation: {
    name: 'Review query overlap and cannibalisation',
    summary:
      'Find queries associated with several URLs and separate healthy search coverage from genuine intent, canonical, or consolidation problems.',
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
      primaryKeyword: 'community intent',
      supportingKeywords: ['search console queries', 'content optimization'],
    },
  },
  'compare-crawls': {
    name: 'Compare two saved crawls',
    summary:
      'See which pages and technical issues appeared, disappeared, or changed between two saved crawl snapshots.',
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
      primaryKeyword: 'SEO crawl',
      supportingKeywords: [],
    },
  },
  'content-optimization': {
    name: 'Build a content optimization brief',
    summary:
      'Create a focused brief for one existing page from its own search queries and the content observed on the live URL.',
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
      primaryKeyword: 'seo crawl',
      supportingKeywords: ['technical SEO audit', 'site audit'],
    },
  },
  'site-crawl': {
    name: 'Sitemap health check and technical site crawl',
    summary:
      'Check sitemap URL health first, then run a full technical crawl only when page-level evidence is needed.',
    inputs: [
      {
        label: 'Explicit sitemap or bounded sitemap discovery',
        source: 'sitemaps',
        role: 'Defines the URL set for the health pass and keeps sitemap source, completeness, redirects, and limits visible.',
      },
      {
        label: 'Live responses and robots.txt',
        source: 'robots',
        role: 'Provides status, redirect, network, crawler access, and robots decisions without consuming page bodies in health mode.',
      },
      {
        label: 'Full crawl page evidence when requested',
        source: 'crawlable-links',
        role: 'Adds discovered links, metadata, directives, content extraction, structured data, and rendered evidence after the health pass.',
      },
      {
        label: 'Optional Search Console and Google Analytics joins',
        source: 'search-analytics',
        role: 'Adds available first-party value to fetched landing pages in full mode without filling missing rows with zero.',
      },
    ],
    checks: [
      'Health mode checks sitemap URL status, redirects, robots decisions, network failures, and access blocks with uncached, status-only probes.',
      'Full mode fetches and extracts pages within the configured origin, depth, page, rate, inclusion, exclusion, robots, sitemap, and JavaScript settings.',
      'Full mode runs maintained response, redirect, canonical, indexability, metadata, heading, link, structured-data, international, security, mobile, and content observations.',
    ],
    returns: [
      'A compact health result with exact URLs, statuses, redirects, robots outcomes, network failures, crawler identity, and access-block guidance.',
      'In full mode, grouped page-level issues, top fixes, warnings, caveats, source coverage, and an optional local report id.',
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
      primaryKeyword: 'technical SEO audit',
      supportingKeywords: ['seo site audit', 'seo crawler', 'website audit'],
    },
  },
  'ctr-underperformers': {
    name: 'Find weak CTR evidence',
    summary:
      'Find high-impression queries whose CTR trails a documented expectation and review the search result before changing anything.',
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
      primaryKeyword: 'ctr optimization',
      supportingKeywords: ['google search console seo', 'seo quick wins'],
    },
  },
  'decaying-pages': {
    name: 'Find declining search pages and queries',
    summary:
      'Find returned page and query rows with supported click declines across two matched Search Console windows.',
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
      primaryKeyword: 'content decay SEO',
      supportingKeywords: ['decaying content', 'google search console seo'],
    },
  },
  'setup-check': {
    name: 'Check your local SEO setup',
    summary:
      'Find local Google sign-in, scope, configuration, and saved project problems before they cause empty or failed reports.',
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
      'Checks read-only scopes and saved Search Console or Google Analytics defaults without sending credentials anywhere.',
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
      primaryKeyword: 'SEO CLI',
      supportingKeywords: [],
    },
  },
  'entity-readiness': {
    name: 'Check entity and publisher signals',
    summary:
      'Review naming, authorship, dates, schema, and sameAs links without claiming a search engine has recognised an entity.',
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
      primaryKeyword: 'entity SEO',
      supportingKeywords: ['schema audit', 'ai search optimization'],
    },
  },
  'explain-crawl-issue': {
    name: 'Understand a crawler issue',
    summary:
      'Turn one crawler rule id into plain-English meaning, practical fixes, impact context, and a repeatable verification step.',
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
      primaryKeyword: 'technical SEO issues',
      supportingKeywords: [],
    },
  },
  'geo-gaps': {
    name: 'Check Google AI search controls',
    summary:
      'Find crawl, indexability, and snippet controls that can block Google AI search eligibility on selected pages.',
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
        reportId: 'ai-mention-research',
        doInstead:
          'No report can predict whether Google will select a page. Run AI mention research for bounded provider-indexed Google AI Overview evidence, then inspect its coverage, market, question samples, and citations before describing visibility.',
      },
    ],
    seo: {
      primaryKeyword: 'Google AI Overview SEO',
      supportingKeywords: ['AI search optimization'],
    },
  },
  'crawl-report': {
    name: 'Open a saved crawl report',
    summary:
      'Retrieve one local crawl snapshot in compact form and request its page or issue inventory only when you need it.',
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
      primaryKeyword: 'SEO crawl report',
      supportingKeywords: ['SEO audit report'],
    },
  },
}
