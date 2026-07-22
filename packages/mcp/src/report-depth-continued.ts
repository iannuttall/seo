import type { ReportDepth } from './report-depth.js'

export const REPORT_DEPTH_CONTINUED = {
  'ai-mention-research': {
    readOrder: [
      'dataStatus, exact surface and market, source statuses, coverage, cache, cost, and warnings',
      'summary and comparison provider values before targetComparisonShare',
      'samples with observation times, model, answerTruncated, sources, and ownedSources',
      'firstParty source limits and each sample lexical overlap state',
      'questionPatterns, dataSourceBriefs, findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'Provider-indexed records are not live prompt observations, a complete census, or proof of current AI visibility.',
      'Comparison share is limited to the supplied targets and returned provider dataset. It is not a universal score.',
      'Mention count, AI search volume, and citations do not prove referral traffic, sentiment, authority, or future performance.',
      'Lexical overlap and repeated question terms do not prove shared intent or justify a new page or programmatic template.',
    ],
    verify:
      'Inspect cited pages and current results, then run fixed prompt observations for a small stable question set before changing content or templates.',
    related: [
      {
        id: 'ai-prompt-observations',
        reason: 'Records current answers for fixed prompts.',
      },
      { id: 'ai-referrals', reason: 'Measures identifiable referral visits.' },
      { id: 'ai-readiness', reason: 'Checks technical access controls.' },
      {
        id: 'keyword-opportunities',
        reason: 'Starts from first-party demand.',
      },
    ],
  },
  'ai-prompt-observations': {
    readOrder: [
      'dataStatus, exact prompt and model combinations, market label, web-search setting, and request count',
      'each observation evidence coverage, cache state, requested and effective model, checkedAt, answerTruncated, cost, and warnings',
      'answer text, citations, target matches, and comparison status',
      'firstParty source limits and each supporting-search word-match state',
      'citedDomains, fanOutThemes, findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'A generated answer is one sample, not a census of what every user sees or proof of universal AI visibility.',
      'not-observed applies only to the retained answer and supplied aliases. It is not proof of absence.',
      'A citation does not prove that the source supports every answer claim, caused traffic, or will recur. Model changes, cache hits, partial evidence, and truncated answers are not comparable trend points.',
      'Supporting-search and Search Console word matches do not prove shared intent, independent demand, or that a new page or programmatic template should be built.',
    ],
    verify:
      'Inspect the answer and cited pages, validate research leads with keyword and current result evidence, and repeat only decision-critical prompts with the same effective model and complete evidence.',
    related: [
      {
        id: 'ai-mention-research',
        reason: 'Adds broader provider-indexed mention evidence.',
      },
      { id: 'ai-referrals', reason: 'Measures identifiable referral visits.' },
      {
        id: 'keyword-opportunities',
        reason: 'Validates first-party demand and content coverage.',
      },
      { id: 'pseo-opportunities', reason: 'Researches viable template ideas.' },
    ],
  },
  'competitor-keyword-gap': {
    readOrder: [
      'dataStatus, source statuses, market, and selection bounds',
      'summary classification counts before the returned candidate subset',
      'processing counts for first-party rows, token postings, competitor rows, and candidate terms',
      'candidate classification, relevance state, firstParty, ownProviderRank, and competitor rows',
      'pseo proposal, repeatedCompetitorPatterns, dataSourceBriefs, findings, and caveats',
    ],
    doNotClaim: [
      'A provider-only competitor term is not automatically relevant, missing from the site, or worth targeting.',
      'not-in-retained Search Console evidence is not proof of zero impressions or no existing coverage.',
      'Lexical overlap and repeated URL patterns do not prove intent, demand, page quality, or that a template should be built.',
    ],
    verify:
      'Inspect current results, representative competitor pages, existing first-party pages, and an authoritative data source before approving a candidate.',
    related: [
      { id: 'serp-competitors', reason: 'Finds and classifies domains first.' },
      { id: 'ranking-pages', reason: 'Inspects repeated competitor pages.' },
      {
        id: 'keyword-opportunities',
        reason: 'Starts from first-party demand.',
      },
    ],
  },
  'domain-overview': {
    readOrder: [
      'dataStatus, market, provider coverage, cache, cost, and warnings',
      'summary and evidence.data.organic provider values',
      'firstParty status, range, and measured values when requested',
      'findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'Provider traffic, keyword counts, ranking movements, and traffic cost are estimates, not measured site performance.',
      'Do not subtract provider estimates from Search Console values or turn them into a percentage gap.',
      'Empty, capped, partial, invalid, or unavailable evidence cannot support a zero footprint or all-clear.',
    ],
    verify:
      'Use Search Console for actual site performance and inspect ranking pages or current results before acting on provider estimates.',
    related: [
      { id: 'ranking-pages', reason: 'Shows pages behind the footprint.' },
      { id: 'ranked-keywords', reason: 'Shows bounded keyword rows.' },
      {
        id: 'search-performance-overview',
        reason: 'Starts with first-party performance.',
      },
    ],
  },
  'ranked-keywords': {
    readOrder: [
      'dataStatus, market, coverage, request filters, cache, cost, and warnings',
      'summary totals and returned evidence.data.rows',
      'firstParty status, caps, and per-row match states when requested',
      'findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'Provider rank, traffic, volume, difficulty, and intent are not live result or first-party evidence.',
      'A query absent from retained Search Console rows is not proof of no impressions or no ranking.',
      'The returned page is not a full domain keyword inventory when coverage is filtered, capped, or paginated.',
    ],
    verify:
      'Run a current result report for any keyword whose rank, result type, or intent would change the decision.',
    related: [
      { id: 'serp-results', reason: 'Checks a current result snapshot.' },
      { id: 'ranking-pages', reason: 'Groups ranking pages and URL patterns.' },
      {
        id: 'keyword-opportunities',
        reason: 'Adds first-party opportunity logic.',
      },
    ],
  },
  'ranking-pages': {
    readOrder: [
      'dataStatus, market, coverage, request filters, cache, cost, and warnings',
      'summary and bounded evidence.data.rows',
      'firstParty page matches when requested',
      'repeatedPatterns, findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'Estimated traffic and keyword counts are not measured page traffic.',
      'A repeated path is a structural heuristic, not proof of shared intent, quality, or a programmatic generator.',
      'Patterns from a filtered or paginated page sample may not describe the whole domain.',
    ],
    verify:
      'Inspect representative pages, their ranked queries, current results, data sources, and first-party performance before changing or creating a template.',
    related: [
      { id: 'ranked-keywords', reason: 'Shows queries behind a page.' },
      { id: 'pseo-audit', reason: 'Checks first-party template quality.' },
      { id: 'competitor-keyword-gap', reason: 'Classifies possible gaps.' },
    ],
  },
  'serp-competitors': {
    readOrder: [
      'dataStatus, market, querySetSize, coverage, request, cache, and cost',
      'competitors relationship, siteType, classificationSource, and keywordCoverage',
      'findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'A recurring result domain is a search competitor for this keyword set, not automatically a business competitor.',
      'unknown site types must stay unknown until the user or agent classifies them.',
      'Visibility and traffic estimates are not complete market share or measured traffic.',
    ],
    verify:
      'Review unknown domains and current representative results before selecting a small explicit set for gap research.',
    related: [
      { id: 'ranking-pages', reason: 'Inspects a relevant domain.' },
      { id: 'competitor-keyword-gap', reason: 'Compares explicit domains.' },
      { id: 'serp-results', reason: 'Checks one current result set.' },
    ],
  },
  'monthly-action-plan': {
    readOrder: [
      'workflow summary, steps, actions, and nested output',
      'requested month and final-data window',
      'provider status and skipped sections',
      'warnings, caveats, and retained caps',
    ],
    doNotClaim: [
      'A skipped section is not a zero and a successful workflow does not make every nested source complete.',
      'Actions are a review queue, not automatic edit instructions.',
      'Do not invent click, traffic, ranking, or revenue forecasts or attribute movement to an update from timing alone.',
    ],
    verify:
      'Trace each narrative claim back to its structured diagnosis or measurement and confirm affected URLs.',
    related: [
      { id: 'monthly-report', reason: 'Produces the human brief.' },
      { id: 'refresh-priorities', reason: 'Builds a refresh queue.' },
      { id: 'search-performance-overview', reason: 'Gives a baseline.' },
    ],
  },
  'monthly-report': {
    readOrder: [
      'month and the underlying date windows',
      'dataStatus and source completeness',
      'skipped sections, warnings, and caveats',
      'the narrative and its referenced diagnosis, changes, and priorities',
    ],
    doNotClaim: [
      'A zero from a complete source differs from an unavailable, partial, filtered, or capped section.',
      'verifyLimit is a bounded subset, not full-site validation.',
      'The report cannot establish why traffic changed or forecast clicks, rankings, or revenue.',
    ],
    verify:
      'Follow a narrative reference into the structured evidence and validate the affected URLs before acting.',
    related: [
      { id: 'monthly-action-plan', reason: 'Sequences the actions.' },
      {
        id: 'narrative-report',
        reason: 'Assembles an evidence-linked briefing.',
      },
      { id: 'search-performance-overview', reason: 'Gives a baseline.' },
    ],
  },
  'narrative-report': {
    readOrder: [
      'top-level caveats and headline',
      'sections and priorities',
      'diagnosis, changeMeasurements, and changeMeasurementAttempts',
      'monitoring',
    ],
    doNotClaim: [
      'A failed or skipped measurement stays visible and is not a zero.',
      'Update timing, template groupings, and opportunity scores are investigation context, not ranking causes.',
      'The narrative summarizes evidence and does not strengthen it or prove causation.',
    ],
    verify:
      'Reproduce a technical failure or inspect the affected URLs before treating a narrative claim as a defect.',
    related: [
      { id: 'monthly-report', reason: 'Fixes a calendar-month brief.' },
      { id: 'refresh-priorities', reason: 'Builds a refresh queue.' },
      { id: 'search-performance-overview', reason: 'Gives a baseline.' },
    ],
  },
  'okf-build': {
    readOrder: [
      'manifest schema version, report id, source URL, generation time, crawl status, title, concept count, and caveats',
      'selection page counts and deterministic ordering',
      'the returned validation before using files',
    ],
    doNotClaim: [
      'If selected pages equal the limit the bundle is bounded, not exhaustive.',
      'A successful structural validation does not establish ownership, freshness, factual accuracy, or completeness.',
      'The builder does not make extracted claims true or current.',
    ],
    verify:
      'Inspect citations, canonical URLs, and summaries against source pages, especially for time-dependent claims.',
    related: [
      { id: 'okf-validate', reason: 'Validates the bundle.' },
      { id: 'crawl-report', reason: 'Inspects the source crawl.' },
      { id: 'generate-llms-txt', reason: 'Builds agent navigation.' },
    ],
  },
  'okf-validate': {
    readOrder: [
      'validation.valid and file and concept counts',
      'each issue level, path, and message',
      'explanation.nextActions as ordering guidance',
    ],
    doNotClaim: [
      'Validation checks the file contract only and does not browse cited sources or determine whether the knowledge is true, current, owned, or complete.',
      'Warnings still require review even when valid is true.',
      'Never report valid true as fact checked.',
    ],
    verify:
      'After structural success, separately verify cited URLs, claims, dates, and the recorded crawl snapshot.',
    related: [{ id: 'okf-build', reason: 'Builds the bundle to validate.' }],
  },
  'page-opportunities': {
    readOrder: [
      'dataStatus, range, source.targetRowsFetched, selection, and benchmark',
      'benchmark.possiblyTruncated',
      'verification.status and reason',
      'per-item query metrics, opportunity type, and benchmark and verification evidence',
    ],
    doNotClaim: [
      'Only verified results support live-page coverage observations.',
      'estimatedCtrClickShortfall is a directional calculation, not a click forecast.',
      'summary.opportunities is a review queue, not a defect count, and partial data is not an all-clear.',
    ],
    verify:
      'Inspect the live SERP and resolve any status or indexability contradiction before editing.',
    related: [
      { id: 'content-optimization', reason: 'Builds a page brief.' },
      { id: 'quick-wins', reason: 'Ranks CTR opportunities.' },
      { id: 'internal-links', reason: 'Finds contextual links.' },
    ],
  },
  'performance-audit': {
    readOrder: [
      'dataStatus, source, labDataStatus, and fieldDataStatus',
      'Lighthouse score, lab metrics, and labInsights',
      'CrUX fieldData.metrics with scope, formFactor, and collectionPeriod',
      'fetch-fallback fields when source is fetch-fallback',
    ],
    doNotClaim: [
      'Origin-level CrUX data is not page-level evidence.',
      'A fetch-fallback duration is the local fetch workflow, not TTFB, LCP, CLS, TBT, or INP, and never earns a score.',
      'Do not combine lab and field values into a new score, compare mobile with desktop as equal populations, or claim a ranking outcome.',
    ],
    verify:
      'Reproduce the relevant lab issue and re-run the audit after the change.',
    related: [
      { id: 'audit-page', reason: 'Runs an on-page audit.' },
      { id: 'site-crawl', reason: 'Builds the site inventory.' },
    ],
  },
  'pseo-audit': {
    readOrder: [
      'dataStatus, source, selection, warnings, and caveats',
      'population separating discovered, GSC-visible, sampled, and untested URLs',
      'the template verdict confirmed against crawl, inspection, and evidence',
      'metrics.topQueries and queryPatterns',
    ],
    doNotClaim: [
      'PASS is the only indexed URL Inspection verdict and coverageState is diagnostic text that must not be parsed for index state.',
      'A sitemap URL with no GSC row does not prove zero demand.',
      'Literal term coverage and path entity fit are review heuristics, not ranking factors, and word count is descriptive.',
    ],
    verify:
      'For an index-risk or crawl-risk verdict, inspect the sampled URLs directly and state the sample count.',
    related: [
      { id: 'index-coverage', reason: 'Reviews coverage signals.' },
      { id: 'affected-urls', reason: 'Lists URLs for a rule.' },
      { id: 'content-optimization', reason: 'Builds a page brief.' },
    ],
  },
  'pseo-opportunities': {
    readOrder: [
      'dataStatus, summary, market, selection, and caveats',
      'source.pseoAudit and source.queryClusters before external evidence',
      'source.external.discovery coverage, cache, cost, warnings, and candidate value states',
      'source.external.serps observations and competitors with exact evidence references',
      'dataSourceBriefs and nextSteps only after checking the supporting evidence',
    ],
    doNotClaim: [
      'A discovered term absent from retained Search Console rows does not prove zero first-party visibility.',
      'Keyword estimates, category ideas, related-search terms, repeated domains, and repeated URL patterns do not prove authority, ranking feasibility, shared intent, page quality, or that an existing template should expand.',
      'A data-source brief does not establish that a dataset exists, may be reused, or can support differentiated pages.',
      'Do not recommend one page per keyword or combinatorial page generation from volume alone.',
    ],
    verify:
      'Inspect the retained live results and representative existing pages, then validate identifiers, fields, freshness, usage rights, missing-value rules, crawl controls, and internal links before expanding a template.',
    related: [
      { id: 'pseo-audit', reason: 'Validates existing template evidence.' },
      { id: 'keyword-research', reason: 'Expands a supplied seed list.' },
      { id: 'serp-results', reason: 'Inspects one live result snapshot.' },
      { id: 'query-clusters', reason: 'Reviews first-party query groups.' },
    ],
  },
  'keyword-metrics': {
    readOrder: [
      'dataStatus, summary, market, and caveats',
      'evidence coverage, warnings, cache status, request, and cost',
      'each evidence value state before using its number',
      'analysis trend methodology and findings evidenceRef',
      'nextSteps for first-party and result-page verification',
    ],
    doNotClaim: [
      'Search volume and result counts are provider estimates, not measured traffic or complete inventories.',
      'Keyword difficulty is not a ranking probability and does not establish whether this site can rank.',
      'A trend heuristic does not forecast future demand, and a missing value is not zero.',
    ],
    verify:
      'Compare the term with first-party Search Console evidence and inspect a current result page in the same market before choosing work.',
    related: [
      { id: 'query-clusters', reason: 'Groups first-party query themes.' },
      { id: 'quick-wins', reason: 'Finds first-party CTR candidates.' },
      { id: 'striking-distance', reason: 'Finds near-page-one evidence.' },
    ],
  },
  'keyword-opportunities': {
    readOrder: [
      'dataStatus, summary, range, methodology, and caveats',
      'firstParty source calls, row cap, possiblyTruncated, and each existing analysis selection',
      'external requested, status, selection, provider coverage, warnings, cache, and cost',
      'combined firstParty evidence and external evidenceRef with every provider value state',
      'candidateClusters, programmaticPatterns, findings, and dataSourcePrompts',
      'nextSteps for the supplying report, programmatic audit, and current result inspection',
    ],
    doNotClaim: [
      'Overlapping quick-win, second-page, and striking-distance signals are different views of retained rows, not independent confirmations.',
      'External estimates do not change first-party scores, prove demand, predict traffic, or establish site-specific ranking feasibility.',
      'Candidate clusters and template signatures do not prove shared intent or justify creating more pages.',
      'Average position is not exact rank, and this report contains no live result or competitor-ranking evidence.',
    ],
    verify:
      'Open the full supplying report for page-level evidence, validate representative template pages, and inspect a current result page in the same market before choosing work.',
    related: [
      { id: 'keyword-metrics', reason: 'Reviews a supplied keyword list.' },
      { id: 'pseo-audit', reason: 'Validates repeated page templates.' },
      { id: 'quick-wins', reason: 'Shows the full CTR evidence.' },
      { id: 'striking-distance', reason: 'Shows the full query rows.' },
    ],
  },
  'keyword-research': {
    readOrder: [
      'dataStatus, summary, market, caveats, and requested source count',
      'evidence coverage, warnings, cache status, request, and cost',
      'each keyword sources array and provider value state before using a metric',
      'analysis trend methodology and findings evidenceRef',
      'nextSteps for intent, result-page, and first-party verification',
    ],
    doNotClaim: [
      'Appearing in several discovery sources is not independent confirmation of demand, shared intent, or ranking feasibility.',
      'Provider metrics are estimates, a missing value is not zero, and an observed zero does not prove no demand.',
      'A discovered keyword does not justify a new page or programmatic template without content-fit and result-page review.',
    ],
    verify:
      'Check shared intent in a live result snapshot and compare relevant terms with first-party evidence before choosing work.',
    related: [
      { id: 'serp-results', reason: 'Shows the current result snapshot.' },
      { id: 'keyword-metrics', reason: 'Reviews a supplied keyword list.' },
      { id: 'query-clusters', reason: 'Groups first-party query themes.' },
      { id: 'pseo-audit', reason: 'Validates repeated page templates.' },
    ],
  },
  'local-search-demand': {
    readOrder: [
      'dataStatus, source row cap, possiblyTruncated, and selection exclusions',
      'methodologyDetails supplied terms and automatic heuristic patterns',
      'opportunities intent evidence, metrics, page coverage, and action',
      'templates as repeated page review signals',
      'serpEvidence requested status, exact market, coverage, cache, cost, features, and organic rows',
      'caveats and nextSteps',
    ],
    doNotClaim: [
      'A place in a query is not evidence of the searcher location, and Google Analytics geography cannot prove the query.',
      'Search Console average position is not an exact city rank, and one live snapshot is not rank history.',
      'A local pack feature does not expose every listing, prove business visibility, or replace Google Business Profile evidence.',
      'A repeated local URL pattern does not prove shared intent, page quality, unique source data, or permission to scale.',
    ],
    verify:
      'Inspect representative landing pages and the retained live results in the same location, language, and device before changing or expanding local pages.',
    related: [
      { id: 'pseo-audit', reason: 'Validates repeated local page templates.' },
      { id: 'serp-results', reason: 'Opens one local result snapshot.' },
      { id: 'rank-tracking', reason: 'Measures exact local ranks over time.' },
      {
        id: 'keyword-research',
        reason: 'Finds candidate terms beyond retained Search Console queries.',
      },
    ],
  },
  'saved-keywords': {
    readOrder: [
      'dataStatus, summary, evidence pagination, and any tag filter',
      'the saved set market, source, refresh time, and keyword count',
      'each item metric value state, observation time, tags, and page mapping',
      'analysis groups, findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'User-managed tags do not prove shared intent or justify one page or template.',
      'Provider metrics are estimates rather than first-party rankings or traffic, and a missing value differs from an observed zero.',
      'A target or proposed page mapping does not prove that the page should exist, ranks, or is indexed.',
      'A filtered, capped, or paginated view cannot support a conclusion about the complete set.',
    ],
    verify:
      'Compare relevant terms with Search Console and inspect current results in the saved market before changing a page or template plan.',
    related: [
      { id: 'keyword-metrics', reason: 'Refreshes a supplied term list.' },
      { id: 'keyword-research', reason: 'Discovers more candidate terms.' },
      {
        id: 'keyword-opportunities',
        reason: 'Adds first-party opportunity evidence.',
      },
      {
        id: 'pseo-opportunities',
        reason: 'Reviews repeatable programmatic patterns.',
      },
    ],
  },
  'query-clusters': {
    readOrder: [
      'summary cluster and query counts, clicks, impressions, threshold, limit, and brand filtering',
      'per-cluster member queries, pages, demand, and performance',
      'each cluster recommendation',
    ],
    doNotClaim: [
      'Token overlap does not prove shared intent, justify a new page, or establish that current URLs compete.',
      'Page-two clusters do not claim a CTR-only click lift.',
      'Queries below the threshold or outside the cap are outside the conclusion, not absent demand.',
    ],
    verify:
      'Check whether a cluster maps to one intent before changing section structure or navigation.',
    related: [
      { id: 'cannibalisation', reason: 'Checks URL overlap.' },
      { id: 'content-optimization', reason: 'Builds a page brief.' },
      { id: 'community-intent', reason: 'Reviews intent language.' },
    ],
  },
  'quick-wins': {
    readOrder: [
      'dataStatus, date range, source row cap, possiblyTruncated, selection.invalidRows, and filters',
      'methodology and each item benchmark confidence before using targetCtr',
      'estimatedCtrClickShortfall and priority',
      'verification requested, attempted, verified, failed, and technical counts',
    ],
    doNotClaim: [
      'estimatedCtrClickShortfall and priority score are heuristics, explicitly not estimated lift.',
      'Average position is not a stable rank, and an unverified item cannot support a content-coverage conclusion.',
      'Filtered or capped evidence is not an all-clear.',
    ],
    verify:
      'Inspect the live SERP, test clearer snippet framing, then compare a later complete window.',
    related: [
      { id: 'ctr-underperformers', reason: 'Adds CTR peer evidence.' },
      { id: 'page-opportunities', reason: 'Reviews one URL.' },
      { id: 'striking-distance', reason: 'Finds rows near page one.' },
    ],
  },
  'redirect-trace': {
    readOrder: [
      'chain in order with requested URL, status, Location, resolved next, and duration',
      'finalUrl versus finalPage and summary.finalStatus',
      'summary.issues',
      'metaRobots, xRobotsTag, canonical, and warnings',
    ],
    doNotClaim: [
      'The trace is one observation from the machine and time that ran it, and CDNs, geography, cookies, or later deploys can differ.',
      'A canonical elsewhere or a 302 can be intentional.',
      'JavaScript rendering affects final-page extraction, not the HTTP chain.',
    ],
    verify:
      'Re-run the trace after deployment and confirm the intended destination and status.',
    related: [
      { id: 'link-recovery', reason: 'Prioritises search-value URLs.' },
      { id: 'audit-page', reason: 'Audits the final page.' },
      { id: 'audit-urls', reason: 'Runs bounded checks.' },
    ],
  },
  'refresh-priorities': {
    readOrder: [
      'workflow steps and skipped states',
      'per-item source, impactKind, score breakdown, date window, completeness, verification status, and rationale',
      'the top few URLs manually',
    ],
    doNotClaim: [
      'A click decline, low CTR, second-page position, and Google Analytics session signal have different semantics and are not interchangeable.',
      'Missing Google Analytics or failed fetches stay unavailable, not zero-weight proof.',
      'The score is not expected clicks, revenue, ranking lift, or causal confidence.',
    ],
    verify:
      'Confirm query intent, current content, and internal links for the top URLs before choosing a bounded edit.',
    related: [
      { id: 'decaying-pages', reason: 'Shows click declines.' },
      { id: 'quick-wins', reason: 'Ranks CTR opportunities.' },
      { id: 'second-page', reason: 'Finds rows near page one.' },
    ],
  },
  'search-performance-overview': {
    readOrder: [
      'workflow envelope with summary, steps, actions, and output',
      'report dataStatus, skipped sections, and partial reasons',
      'priorities',
      'nested anomaly, update, segment, decay, cannibalisation, striking-distance, and quick-win results',
    ],
    doNotClaim: [
      'One complete section must not hide a failed or capped neighbour.',
      'Sparse data may legitimately skip a section.',
      'Update overlap, opportunity scores, average position, and timing are investigation signals, not causation or forecasts.',
    ],
    verify:
      'Run the focused report named in actions and confirm affected URLs and provider dates before editing.',
    related: [
      { id: 'segment-impact', reason: 'Shows where movement sits.' },
      { id: 'quick-wins', reason: 'Ranks CTR opportunities.' },
      { id: 'striking-distance', reason: 'Finds rows near page one.' },
    ],
  },
  'second-page': {
    readOrder: [
      'source completeness, date range, selection, methodology, provenance, and brand filtering',
      'per-item impressions, clicks, CTR, and average position',
      'the priority value',
    ],
    doNotClaim: [
      'Average position is aggregated across searches, locations, devices, and time and is not an exact rank.',
      'Retained limits mean the output is not a complete inventory.',
      'Priority is a transparent heuristic, not expected click lift, and one row is not cannibalisation.',
    ],
    verify:
      'Inspect the live page and search intent and confirm the query suits the URL before one defensible change.',
    related: [
      { id: 'striking-distance', reason: 'Covers positions 11-20.' },
      { id: 'quick-wins', reason: 'Ranks CTR opportunities.' },
      { id: 'page-opportunities', reason: 'Reviews one URL.' },
    ],
  },
  'serp-results': {
    readOrder: [
      'dataStatus, summary, market, checkedAt, caveats, and corrected query state',
      'evidence coverage, warnings, cache status, request, and cost',
      'organicResults rankAbsolute, rankGroup, page, domain, URL, title, and snippet evidence',
      'domains and findings for repeated domains or query correction',
      'nextSteps for page, intent, and repeat-snapshot review',
    ],
    doNotClaim: [
      'One snapshot is not rank history, and it does not establish a stable or personalized ranking.',
      'Repeated domains and result features do not prove authority, quality, weakness, or site-specific ranking feasibility.',
      'Provider result counts are estimates, and a bounded depth is not a complete result inventory.',
    ],
    verify:
      'Open the retained pages, confirm the query intent, and repeat the same market and device snapshot when stability matters.',
    related: [
      { id: 'keyword-research', reason: 'Discovers candidate terms.' },
      { id: 'keyword-metrics', reason: 'Adds independent estimates.' },
      {
        id: 'striking-distance',
        reason: 'Shows first-party position evidence.',
      },
      { id: 'content-optimization', reason: 'Builds a page brief.' },
    ],
  },
  'rank-tracking': {
    readOrder: [
      'dataStatus, configuration market, devices, targetDomain, depth, collection method, cadence, and run state',
      'coverage, pending and failed counts, provider cost, warnings, and caveats',
      'comparison prior run and per-item current and previous observation states',
      'organic position change, absolute position, ranking URL changes, and checkedAt',
      'nextSteps for first-party context, template review, or queued collection',
    ],
    doNotClaim: [
      'Not observed within the configured depth is not proof that the domain does not rank.',
      'Exact snapshots must not be substituted for Search Console average position or blended across markets and devices.',
      'A ranking change alone does not establish causation, traffic impact, or future performance.',
      'Pending or failed tasks cannot be treated as losses or zero rankings.',
    ],
    verify:
      'Confirm the same market, device, depth, and target-domain scope, then inspect the ranking URL and Search Console evidence before acting.',
    related: [
      { id: 'serp-results', reason: 'Inspects the current result page.' },
      { id: 'saved-keywords', reason: 'Reviews the tracked keyword set.' },
      { id: 'quick-wins', reason: 'Adds first-party opportunity evidence.' },
      {
        id: 'striking-distance',
        reason: 'Adds first-party average-position evidence.',
      },
    ],
  },
  'segment-impact': {
    readOrder: [
      'before, after, and rangeDays',
      'dataStatus and source.before, source.after, and completeness for caps and truncation',
      'selection invalid, duplicate, conflicting, matched, unmatched, returned, and limited rows',
      'per-item clickDelta, impressionDelta, and positionDelta, then unmatchedSegments',
    ],
    doNotClaim: [
      'A positive positionDelta is worse because a larger average position is lower in results.',
      'unmatchedSegments are retained in one window only and are not gains from or losses to zero.',
      'A limited or truncated result cannot support an inventory-wide winner or loser.',
    ],
    verify:
      'Audit the top matched movers pages and query intent before drawing a segment conclusion.',
    related: [
      { id: 'traffic-anomaly', reason: 'Confirms movement first.' },
      { id: 'decaying-pages', reason: 'Shows click declines.' },
      { id: 'update-postmortem', reason: 'Frames movement around an update.' },
    ],
  },
  'seo-to-ai-query': {
    readOrder: [
      'dataStatus states empty, filtered, partial, and available',
      'dateRange, source.possiblyTruncated, filters, selection.invalidRows, and limited rows',
      'methodology.observedAiPromptData and estimatedTrafficLift, both false',
      'per-item evidenceScope',
    ],
    doNotClaim: [
      'Generated prompt count is not AI demand and prompts do not prove anyone entered them or that an answer mentioned the site.',
      'No returned rows is not an all-clear when the source is partial or filtered.',
      'Each prompt inherits the narrow retained-GSC-query scope.',
    ],
    verify:
      'Store the source query and date range beside later monitoring observations and refresh on a controlled schedule.',
    related: [
      {
        id: 'ai-referrals',
        reason: 'Adds Google Analytics referral evidence.',
      },
      { id: 'community-intent', reason: 'Reviews intent language.' },
      { id: 'ai-readiness', reason: 'Checks technical access.' },
    ],
  },
  'setup-check': {
    readOrder: [
      'ok',
      'each checks entry status, distinguishing fail from warn, with detail and fix',
      'generatedAt',
    ],
    doNotClaim: [
      'A passing result means local prerequisites look present, not that a token is still accepted by Google or that the account can access a property.',
      'Missing saved defaults are usually warnings because explicit parameters can replace them.',
      'A setup pass is not evidence about rankings, indexing, or site health.',
    ],
    verify:
      'Apply the fix on a failed check, re-run setup-check, then run a small read-only report for the intended property.',
    related: [
      {
        id: 'search-performance-overview',
        reason: 'First report once setup passes.',
      },
    ],
  },
  'site-crawl': {
    readOrder: [
      'config.strategy first; use health before full on large or unknown sites',
      'status, requestEvidenceStatus, attempted and fetched counts, failures, retained pages, and pageLimitReached',
      'access crawler identity, blockedRequests, provider counts, and samples',
      'data-source states',
      'warnings and caveats, then opt-in pages, requests, and issues',
    ],
    doNotClaim: [
      'A partial or capped crawl cannot support an all-clear or a definitive zero.',
      'A crawl is not an index, traffic source, or guarantee of complete site coverage.',
      'A health pass checks response access, status, and redirects only. It does not download page bodies or evaluate content, metadata, canonicals, indexability directives, internal links, or rendered HTML. For full crawls, state when JavaScript rendering was disabled.',
      'A User-Agent can be spoofed. Never ask the user for a broad firewall bypass based on crawler identity alone.',
    ],
    verify:
      'Re-run the same health configuration first. Use a full crawl only when the health evidence is clean and the question needs page-body analysis.',
    related: [
      { id: 'top-fixes', reason: 'Ranks the fix queue.' },
      { id: 'affected-urls', reason: 'Lists URLs for a rule.' },
      { id: 'index-coverage', reason: 'Checks coverage signals.' },
    ],
  },
  'striking-distance': {
    readOrder: [
      'range, rangeDays, dataStatus, and source',
      'source.possiblyTruncated and retained-row completeness',
      'selection invalid, out-of-range, branded, below-threshold, eligible, returned, and limited',
      'methodology, then per-item metrics and contentVerification',
    ],
    doNotClaim: [
      'The 11-20 band is a heuristic boundary and average position is not a literal second results page.',
      'Unverified or failed pages keep lower confidence.',
      'The priority score is not expected traffic or ranking lift.',
    ],
    verify:
      'Audit a small number of high-impression candidates and fix verified technical problems first.',
    related: [
      { id: 'second-page', reason: 'Covers positions 10-20.' },
      { id: 'quick-wins', reason: 'Ranks CTR opportunities.' },
      { id: 'page-opportunities', reason: 'Reviews one URL.' },
    ],
  },
  'technical-watch': {
    readOrder: [
      'each workflow step and nested crawl, index, and recovery output independently',
      'crawl run ids, limits, failures, and changed items',
      'inspection selected, unselected-due, attempted, failed, quota-blocked, deferred, and regression states',
      'recovery clicks-at-risk as history',
    ],
    doNotClaim: [
      'A successful run does not prove every URL is crawlable, indexed, unchanged, or issue-free.',
      'URL Inspection is a provider snapshot and sitemap discovery is not proof of indexing.',
      'Partial crawls, capped inventories, quotas, and failed subqueries must stay visible in any all-clear.',
    ],
    verify:
      'Reproduce new failures and confirmed regressions, then schedule another bounded run with a rollback path.',
    related: [
      { id: 'crawl-diff', reason: 'Isolates crawl change.' },
      { id: 'index-watch', reason: 'Isolates index change.' },
      { id: 'link-recovery', reason: 'Recovers search-value URLs.' },
    ],
  },
  'top-fixes': {
    readOrder: [
      'dataSources, summary, warnings, and caveats',
      'per-item rule id, affected count, sample URLs, scoreFactors, and whyThisRanks',
      'effort, fix guidance, and verification',
    ],
    doNotClaim: [
      'Rank means highest among retained eligible findings, not globally highest, because the crawl or category may be capped.',
      'Missing provider joins stay unavailable and a numeric zero is meaningful only when the source is complete.',
      'This is not a forecast of rankings, traffic, or revenue.',
    ],
    verify:
      'Run affected-urls for the same rule and report id, then repeat the crawl configuration after implementation.',
    related: [
      { id: 'affected-urls', reason: 'Lists URLs for a rule.' },
      { id: 'explain-crawl-issue', reason: 'Explains the rule.' },
      { id: 'site-crawl', reason: 'Provides the source crawl.' },
    ],
  },
  'traffic-anomaly': {
    readOrder: [
      'coverage with requested dates, expected versus observed days, missing days, invalid rows, and status',
      'anomalies with metric, baseline and comparison dates, percentChange, zScore, and significanceMethod',
      'direction and significant',
    ],
    doNotClaim: [
      'Statistical unusualness does not identify a cause, diagnose a defect, or prove an external event affected the property.',
      'A null percentage from a zero baseline differs from zero change.',
      'Partial coverage can change the baseline.',
    ],
    verify:
      'If movement is significant and coverage is adequate, run segment-impact for pages and queries.',
    related: [
      { id: 'segment-impact', reason: 'Shows where movement sits.' },
      { id: 'update-correlation', reason: 'Adds update timing.' },
      { id: 'decaying-pages', reason: 'Shows click declines.' },
    ],
  },
  'update-correlation': {
    readOrder: [
      'classification with attribution and confidence, returned as not-established and none',
      'anomalies, overlappingUpdates, and confounders',
      'evidence, caveats, and source',
    ],
    doNotClaim: [
      'Overlap cannot show the update caused a gain or loss even with large movement and no other recorded change.',
      'update-overlap-without-significant-movement is not an impact result and no-update-overlap does not explain remaining movement.',
      'Temporal overlap is not a penalty, reward, or confirmed effect.',
    ],
    verify:
      'Test saved deploys, redirects, and content changes that overlap the window before attributing movement.',
    related: [
      { id: 'update-postmortem', reason: 'Maps winners and losers.' },
      { id: 'segment-impact', reason: 'Shows where movement sits.' },
      { id: 'traffic-anomaly', reason: 'Confirms movement first.' },
    ],
  },
  'update-postmortem': {
    readOrder: [
      'workflow step statuses, finalized date windows, and source completeness',
      'failed measurements, retained limits, and caveats',
      'update, insights, templateMovement, and segments',
    ],
    doNotClaim: [
      'The cause remains not established even when dates overlap.',
      'Retained winners and losers are not a complete inventory when sources are capped or filtered.',
      'Do not claim update causation, recovery probability, or future traffic.',
    ],
    verify:
      'Inspect representative URLs from affected segments and reproduce technical changes before any rollback.',
    related: [
      { id: 'update-correlation', reason: 'Adds update timing.' },
      { id: 'segment-impact', reason: 'Shows where movement sits.' },
      { id: 'measure-change', reason: 'Evaluates a fix.' },
    ],
  },
} satisfies Record<string, ReportDepth>
