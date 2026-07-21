import type { ReportEditorial } from './types'

export const opportunityReports = [
  {
    id: 'cannibalisation',
    name: 'Query overlap',
    category: 'opportunities',
    summary:
      'Find queries associated with multiple URLs so you can separate healthy coverage from genuine intent or canonical conflicts.',
    question:
      'Which returned queries surface more than one URL and deserve a closer intent review?',
    useWhen: [
      'Several pages appear to compete for the same search topic.',
      'A migration or template change may have split signals across URLs.',
    ],
    avoidWhen: [
      'You plan to merge pages solely because they share a query. Multiple URLs can be appropriate for different intents.',
    ],
    evidence: [
      'Returned Search Console query and page rows, grouped by normalized query with clicks, impressions, CTR, and average position.',
    ],
    methodology: [
      'Aggregates duplicate provider rows, filters low-evidence groups, and ranks multi-URL exposure candidates with stable tie-breakers.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      limit: 20,
      minImpressions: 100,
      includeBrand: false,
    },
    interpretation: [
      'Compare each URL’s purpose, canonical target, content, and search-result history. Query overlap is the observation; cannibalisation is a hypothesis to verify.',
    ],
    caveats: [
      'Anonymised queries and returned row limits can hide additional URLs or make a group incomplete.',
    ],
    nextSteps: [
      'Audit the competing URLs and decide whether to differentiate, consolidate, redirect, or leave them alone.',
      'Measure any consolidation after a complete comparison window.',
    ],
    related: ['audit-page', 'redirect-trace', 'measure-change'],
    sources: ['search-analytics', 'canonical'],
  },
  {
    id: 'ctr-underperformers',
    name: 'CTR underperformers',
    category: 'opportunities',
    summary:
      'Find high-impression returned queries whose CTR trails a documented expectation, then review the live result before changing anything.',
    question:
      'Which visible query rows may warrant a search-result presentation review?',
    useWhen: [
      'You need a limited list of high-impression rows for title and snippet investigation.',
      'Brand filtering and the selected impression floor match the task.',
    ],
    avoidWhen: [
      'You expect one universal CTR curve to describe every query, device, feature, and result type.',
    ],
    evidence: [
      'Returned Search Console query metrics and the report’s stated CTR expectation.',
    ],
    methodology: [
      'Filters by evidence and compares each eligible row with an explicit benchmark while preserving source limits.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      minImpressions: 250,
      includeBrand: false,
    },
    interpretation: [
      'A gap is a review signal. Inspect search intent, result features, title rendering, snippet text, and device mix before proposing a test.',
    ],
    caveats: [
      'CTR varies by query and search appearance. The report cannot see every SERP context that shaped the metric.',
    ],
    nextSteps: [
      'Use content optimization for a supported page-level brief.',
      'Record and measure any title or snippet change instead of forecasting clicks.',
    ],
    related: ['content-optimization', 'quick-wins', 'measure-change'],
    sources: ['search-analytics'],
  },
  {
    id: 'decaying-pages',
    name: 'Decaying search visibility',
    category: 'opportunities',
    summary:
      'Find query and page rows with supported click declines across matched Search Console windows.',
    question:
      'Which returned search segments lost meaningful clicks in the comparison period?',
    useWhen: [
      'You need a repeatable refresh or investigation queue based on observed losses.',
      'Both comparison windows contain enough finalised evidence.',
    ],
    avoidWhen: [
      'You plan to label an old page stale from its publication date or word count alone.',
    ],
    evidence: [
      'Returned query and page rows from adjacent Search Console periods with absolute and percentage click change.',
    ],
    methodology: [
      'Requires evidence in both windows, applies explicit loss thresholds, and ranks supported declines consistently.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 28,
      comparison: 'previous-period',
      limit: 20,
      minDropPct: 20,
      minPreviousClicks: 10,
      minClickLoss: 5,
    },
    interpretation: [
      'Separate demand loss, position movement, CTR movement, and technical evidence. A decline tells you where to look, not what caused it.',
    ],
    caveats: [
      'Seasonality and missing lower-volume rows can change the shape of a comparison.',
    ],
    nextSteps: [
      'Audit affected pages and inspect their query mix before refreshing content.',
      'Use update correlation or segment impact when the decline is broad.',
    ],
    related: ['audit-page', 'segment-impact', 'update-correlation'],
    sources: ['search-analytics'],
  },
  {
    id: 'internal-links',
    name: 'Internal link candidates',
    category: 'opportunities',
    summary:
      'Find fetched pages with relevant query evidence and no verified contextual link to a chosen target.',
    question:
      'Which existing pages may be useful, natural places to link to this target URL?',
    useWhen: [
      'A sound target page needs better discovery paths or supporting context.',
      'You want a review queue rather than automatic anchor insertion.',
    ],
    avoidWhen: [
      'The target is technically unsuitable, off-intent, or already linked appropriately.',
    ],
    evidence: [
      'Returned Search Console query overlap, fetched source content, target aliases, technical state, and observed link placement.',
    ],
    methodology: [
      'Ranks exact and lexical relevance, fetches a limited candidate set, excludes unsuitable pages, then verifies whether a contextual link exists.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      targetUrl: 'https://example.com/guides/seo',
      days: 90,
      limit: 15,
      checkLimit: 40,
      minImpressions: 25,
    },
    interpretation: [
      'Read the source passage. Add a link only when the target genuinely helps at that point, using anchor text that makes sense to a reader.',
    ],
    caveats: [
      'Unchecked candidates remain unknown when the fetch limit is reached. A relevance score is not an impact forecast.',
    ],
    nextSteps: [
      'Add one useful contextual link and recrawl the source page.',
      'Use audit page to verify the target remains indexable and canonical as intended.',
    ],
    related: ['audit-page', 'site-crawl', 'measure-change'],
    sources: ['search-analytics', 'crawlable-links'],
  },
  {
    id: 'keyword-metrics',
    name: 'Keyword metrics',
    category: 'opportunities',
    summary:
      'Compare a limited keyword set using market-specific demand, trend, cost, competition, difficulty, intent, and result-count estimates.',
    question:
      'Which candidate keywords have enough independent demand evidence to justify a closer search and content review?',
    useWhen: [
      'You already have a keyword list and need estimates for a specific country and language.',
      'You want recent monthly history kept beside current volume and difficulty estimates.',
    ],
    avoidWhen: [
      'You need proof of how your own pages perform. Use a Search Console report for that.',
      'You need an exact rank or a live comparison of the current results.',
    ],
    evidence: [
      'A connected keyword provider, the requested market, provider coverage, cache status, local request cost, and typed metric values.',
    ],
    methodology: [
      'Normalizes and deduplicates at most 50 keywords, keeps zero separate from missing data, and compares the latest three monthly estimates with the preceding three when six consecutive months exist.',
    ],
    exampleParams: {
      keywords: ['seo audit tool', 'technical seo audit'],
      countryCode: 'US',
      languageCode: 'en',
    },
    interpretation: [
      'Use volume and trend to choose what to investigate. Check Search Console and the current results before deciding that a term fits the site or deserves a new page.',
    ],
    caveats: [
      'Every metric is a third-party estimate. Difficulty is not a ranking probability, result count is not a complete competitor set, and a trend is not a forecast.',
    ],
    nextSteps: [
      'Compare the most promising terms with Search Console impressions, clicks, pages, and average position.',
      'Inspect a current result page in the same market before choosing a content or programmatic template target.',
    ],
    related: ['query-clusters', 'quick-wins', 'striking-distance'],
    sources: ['keyword-provider-metrics'],
  },
  {
    id: 'keyword-opportunities',
    name: 'Keyword opportunities',
    category: 'opportunities',
    summary:
      'Combine owner-verified Search Console opportunities with optional market estimates, query clusters, and programmatic template signals.',
    question:
      'Which existing search opportunities deserve deeper page, keyword, or programmatic SEO research?',
    useWhen: [
      'You want one bounded review queue across quick wins, second-page queries, and striking-distance evidence.',
      'Independent market estimates would add useful context to Search Console evidence already associated with the site.',
      'You need query clusters and repeated URL patterns that may justify a programmatic SEO investigation.',
    ],
    avoidWhen: [
      'You need an exact rank, a current result snapshot, or a verified competitor list.',
      'You want external metrics to replace Search Console evidence or automatically change first-party priorities.',
    ],
    evidence: [
      'One bounded Search Console query and page acquisition, three existing opportunity analyses, and optional provider estimates for an explicit market.',
    ],
    methodology: [
      'Selects at most 50 unique first-party opportunity keywords across quick-win, second-page, and striking-distance sections, then keeps optional external estimates separate from their existing scores.',
      'Clusters only the returned opportunity subset and flags repeated URL patterns for representative template and data-source review.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      limit: 10,
      keywordLimit: 30,
      includeExternal: false,
    },
    interpretation: [
      'Start with first-party impressions, pages, average position, and source sections. Use external volume or trend only as added context, then inspect the current result before choosing a target.',
    ],
    caveats: [
      'Search Console omits anonymised queries and average position is not an exact rank. External metrics are estimates, and external acquisition may cost money when explicitly enabled.',
      'Clusters and URL patterns use a selected subset. They can identify a useful programmatic SEO investigation, but cannot prove that more pages should exist.',
    ],
    nextSteps: [
      'Audit the strongest existing page and inspect a current result snapshot for its query and market.',
      'Run the programmatic SEO audit for a repeated template cluster before expanding it.',
    ],
    related: ['keyword-metrics', 'pseo-audit', 'query-clusters', 'audit-page'],
    sources: ['search-analytics', 'keyword-provider-metrics'],
  },
  {
    id: 'keyword-research',
    name: 'Keyword research',
    category: 'opportunities',
    summary:
      'Expand a small seed list into market-specific keyword ideas while keeping discovery sources, missing metrics, coverage, cache status, and request cost visible.',
    question:
      'Which related terms deserve an intent and result-page review before they enter a content plan?',
    useWhen: [
      'You need candidate terms beyond the queries already visible in Search Console.',
      'You want several bounded discovery methods to feed a deeper research shortlist.',
    ],
    avoidWhen: [
      'You plan to publish one page for every returned keyword without checking shared intent or page fit.',
      'You need exact current rankings or a scheduled rank history.',
    ],
    evidence: [
      'A connected keyword provider, explicit seed and discovery-source pairs, the selected market, typed metrics, provider coverage, cache status, and local request cost.',
    ],
    methodology: [
      'Normalises at most five seeds, bounds provider fanout before acquisition, combines selected discovery methods, and deduplicates ideas while retaining every observed seed and source pair.',
      'Keeps zero separate from missing or invalid estimates and labels trend changes only when six consecutive monthly values exist.',
    ],
    exampleParams: {
      seeds: ['local seo software', 'local search tools'],
      sources: ['ideas', 'suggestions'],
      countryCode: 'US',
      languageCode: 'en',
      limit: 40,
    },
    interpretation: [
      'Treat source overlap, volume, trend, and difficulty as ways to choose what to inspect next. They do not prove that two terms share intent or that the site can rank for them.',
    ],
    caveats: [
      'Discovery methods use different expansion rules. Returned terms and metrics are provider evidence, not a complete market inventory, traffic forecast, or page recommendation.',
    ],
    nextSteps: [
      'Inspect a current result snapshot for a short list in the same market.',
      'Compare relevant candidates with Search Console evidence and validate representative programmatic templates before scaling.',
    ],
    related: [
      'serp-results',
      'keyword-metrics',
      'query-clusters',
      'pseo-audit',
    ],
    sources: ['keyword-provider-discovery'],
  },
  {
    id: 'saved-keywords',
    name: 'Saved keyword set',
    category: 'opportunities',
    summary:
      'Review one local keyword set with provider metric freshness, tags, page mappings, and exact view limits kept visible.',
    question:
      'Which saved terms are missing current evidence or still need a page-planning decision?',
    useWhen: [
      'You want to continue earlier keyword research without repeating provider acquisition.',
      'You need to inspect stale metrics, user-managed groups, or unmapped terms in one project set.',
    ],
    avoidWhen: [
      'You need new keyword discovery, a current result snapshot, or proof that saved tags share one search intent.',
    ],
    evidence: [
      'One local project keyword set with its saved market, source, refresh time, typed metric snapshots, tags, and target or proposed page mappings.',
    ],
    methodology: [
      'Reads at most 1,000 saved rows in stable order, keeps filters and pagination explicit, counts missing and stale snapshots separately, and groups tags and page mappings without inferring intent.',
    ],
    exampleParams: {
      projectId: 'example',
      set: 'Priority',
      limit: 100,
      staleDays: 45,
    },
    interpretation: [
      'Use the set as a research workspace. Compare relevant terms with Search Console and current results before changing an existing page or approving a new page or template.',
    ],
    caveats: [
      'Tags and page mappings record planning choices. Provider metrics are estimates, missing evidence is not zero, and a filtered or paginated view cannot describe the complete set.',
    ],
    nextSteps: [
      'Preview the refresh cost before updating stale or missing provider snapshots.',
      'Inspect current results in the saved market and compare relevant terms with first-party evidence.',
    ],
    related: [
      'keyword-metrics',
      'keyword-research',
      'keyword-opportunities',
      'pseo-opportunities',
    ],
    sources: ['keyword-provider-metrics'],
  },
  {
    id: 'pseo-opportunities',
    name: 'Programmatic SEO opportunities',
    category: 'opportunities',
    summary:
      'Join observed template and query-cluster evidence with optional keyword discovery, live results, competitor URL patterns, costs, and data-source research briefs.',
    question:
      'Which existing template extensions or possible new page systems deserve evidence-led research?',
    useWhen: [
      'Repeated templates already earn impressions and need a careful expansion plan.',
      'Query clusters suggest demand that may not fit an observed template.',
      'Live result pages and competitor URL patterns would change the decision.',
    ],
    avoidWhen: [
      'You want one generated page per keyword without checking shared intent or data quality.',
      'You only need to audit the current technical and index state of existing pages.',
    ],
    evidence: [
      'Bounded programmatic SEO audit and Search Console query-cluster evidence, plus optional provider discovery and live result snapshots for an explicit market.',
    ],
    methodology: [
      'Selects at most five seeds from search-evidenced templates and retained query clusters, then keeps discovered candidates linked to those first-party references.',
      'Separates existing-query evidence, observed-template expansion, and new-template research before selecting at most three live result checks.',
      'Groups repeated domains and URL patterns from the retained snapshots without assigning authority, quality, or ranking-feasibility scores.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      includeExternal: false,
      templateLimit: 10,
      clusterLimit: 10,
    },
    interpretation: [
      'Read the first-party templates and clusters first. Use provider metrics and live result patterns as added context, then complete the data-source brief before proposing any generated inventory.',
    ],
    caveats: [
      'Search Console is bounded and omits anonymised queries. Provider metrics are estimates, while live results describe one market, device, and observation time.',
      'A repeated competitor URL pattern is not proof of page quality, authority, reusable data, or a template another site should reproduce.',
    ],
    nextSteps: [
      'Rerun with explicit external market and cost limits only when independent discovery would change the decision.',
      'Inspect representative ranking pages and validate identifiers, fields, coverage, freshness, rights, missing-value rules, crawl controls, and internal links.',
      'Run the programmatic SEO audit with bounded crawl and index samples before changing a generator.',
    ],
    related: [
      'pseo-audit',
      'keyword-research',
      'serp-results',
      'query-clusters',
    ],
    sources: [
      'search-analytics',
      'sitemaps',
      'keyword-provider-discovery',
      'serp-provider-results',
    ],
  },
  {
    id: 'query-clusters',
    name: 'Query clusters',
    category: 'opportunities',
    summary:
      'Group returned queries by reproducible token overlap so a large query export becomes easier to review.',
    question:
      'Which query rows share enough wording to review as a topic group?',
    useWhen: [
      'You need compact themes for research, page review, or reporting.',
      'A repeatable lexical grouping is more useful than a model-generated label.',
    ],
    avoidWhen: [
      'You need a definitive search-intent taxonomy. Similar words can express different needs.',
    ],
    evidence: [
      'Returned Search Console queries and their metrics within the selected site or path scope.',
    ],
    methodology: [
      'Normalizes query tokens, applies a documented overlap rule, aggregates metrics, and uses stable ordering.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      scope: '/guides/',
      minImpressions: 50,
      limit: 20,
      includeBrand: false,
    },
    interpretation: [
      'Use clusters to reduce a review set. Read representative queries before assigning intent or deciding that one page should cover the group.',
    ],
    caveats: [
      'Token overlap misses synonyms and can join phrases whose meaning differs. Anonymised queries are absent.',
    ],
    nextSteps: [
      'Inspect the pages receiving impressions for each useful cluster.',
      'Run query overlap when several URLs appear for the same group.',
    ],
    related: ['cannibalisation', 'page-opportunities', 'content-optimization'],
    sources: ['search-analytics'],
  },
  {
    id: 'quick-wins',
    name: 'Quick-win review queue',
    category: 'opportunities',
    summary:
      'Rank visible query and page rows whose CTR trails a site-aware target, with optional live-page checks before action.',
    question:
      'Which already-visible search rows deserve a focused CTR or content review?',
    useWhen: [
      'You want a small queue from returned positions 4 to 10 with meaningful impressions.',
      'You can verify the live result and page before proposing work.',
    ],
    avoidWhen: [
      'You need guaranteed easy wins. The name describes the queue, not effort or expected lift.',
    ],
    evidence: [
      'Returned Search Console query and page rows, a leave-target-out site benchmark or documented fallback, and optional page verification.',
    ],
    methodology: [
      'Filters positions 4 to 10, compares CTR with the stated benchmark, ranks consistently, and bounds optional page fetches.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      limit: 20,
      minImpressions: 100,
      verifyContent: true,
      verifyLimit: 5,
    },
    interpretation: [
      'Check benchmark confidence and verification status. Estimated click shortfall is a prioritisation heuristic, not a traffic forecast.',
    ],
    caveats: [
      'Search appearance, device mix, brand intent, and SERP features can all explain CTR differences.',
    ],
    nextSteps: [
      'Inspect the SERP and live page for the best-supported rows.',
      'Record a specific change and measure it over a complete later window.',
    ],
    related: ['content-optimization', 'audit-page', 'measure-change'],
    sources: ['search-analytics'],
  },
  {
    id: 'serp-results',
    name: 'Live search results',
    category: 'opportunities',
    summary:
      'Inspect one location and device-specific search snapshot with exact retained organic ranks, domains, result features, coverage, cache status, and request cost.',
    question:
      'What does the current bounded result page show for this query and market?',
    useWhen: [
      'A keyword needs a current intent and result-page review before a content decision.',
      'You need exact snapshot ranks kept separate from Search Console average position.',
    ],
    avoidWhen: [
      'You need scheduled rank history across many terms.',
      'You want domain strength, content quality, or site-specific ranking feasibility inferred from one result page.',
    ],
    evidence: [
      'One provider snapshot with keyword, effective query, observation time, search market, exact organic ranks, URLs, titles, snippets, result features, coverage, cache status, and local request cost.',
    ],
    methodology: [
      'Requests at most 100 results for one bounded query, validates each organic row, sorts exact absolute ranks consistently, and summarizes repeated domains without assigning a strength score.',
    ],
    exampleParams: {
      keyword: 'local seo software',
      countryCode: 'US',
      languageCode: 'en',
      device: 'mobile',
      depth: 20,
    },
    interpretation: [
      'Review the retained pages, result types, and any corrected query. Repeated domains describe this snapshot; they do not prove authority or that another site cannot compete.',
    ],
    caveats: [
      'Results can change between checks and may differ from signed-in or personalised searches. Provider result counts are estimates, and the requested depth is not a complete inventory.',
    ],
    nextSteps: [
      'Open representative ranking pages and confirm the dominant intent before choosing an existing or new target page.',
      'Match query, market, device, and date before comparing the snapshot with first-party position evidence.',
    ],
    related: [
      'keyword-research',
      'keyword-metrics',
      'striking-distance',
      'content-optimization',
    ],
    sources: ['serp-provider-results'],
  },
] as const satisfies readonly ReportEditorial[]
