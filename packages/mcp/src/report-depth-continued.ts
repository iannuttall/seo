import type { ReportDepth } from './report-depth.js'

export const REPORT_DEPTH_CONTINUED = {
  'competitive-opportunities': {
    readOrder: [
      'dataStatus, market, selection bounds, detailBudget, source coverage, cache, costs, warnings, and failed requests',
      'summary and processing counts before the retained opportunity order',
      'each opportunity current result status, target ranks, competitors, reviewReasons, and evidenceRefs',
      'source SERP rows, Domain Rating observations, and link summaries behind decision-critical comparisons',
      'findings, caveats, and nextSteps',
    ],
    doNotClaim: [
      'The investigation order is not a keyword-difficulty, authority, ranking-feasibility, or traffic forecast.',
      'A lower Domain Rating or referring-domain count does not by itself make a result easy to outrank.',
      'Missing, failed, capped, or partial provider evidence is not zero.',
      'A recurring result domain is not automatically a relevant business competitor.',
    ],
    verify:
      'Inspect the current ranking pages, their search intent, existing site coverage, Search Console evidence, and URL-level links before choosing a page or keyword.',
    related: [
      {
        id: 'competitor-keyword-gap',
        reason: 'Compares a small classified competitor set in depth.',
      },
      { id: 'serp-results', reason: 'Refreshes one current result snapshot.' },
      {
        id: 'keyword-research',
        reason: 'Expands seeds without competitor enrichment.',
      },
      {
        id: 'link-evidence',
        reason: 'Inspects decision-critical page links.',
      },
    ],
  },
  'competitor-keyword-gap': {
    readOrder: [
      'dataStatus, source statuses, market, and selection bounds',
      'source evidence.imports file dates, hashes, fields, row quality, and caps when present',
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
  'domain-rating': {
    readOrder: [
      'dataStatus, target, targetMode, observedAt, cache, coverage, and warnings',
      'evidence.data.domainRating, licenseUrl, attribution, and attributionUrl',
      'caveats and nextSteps before using the value in a comparison',
    ],
    doNotClaim: [
      'Domain Rating is an Ahrefs backlink-profile estimate, not a Google metric, ranking factor, traffic estimate, or keyword-difficulty score.',
      'A lower Domain Rating does not by itself mean a result, page, or keyword is easy to outrank.',
      'Missing or unavailable Domain Rating is not zero.',
    ],
    verify:
      'Inspect the current result page, page relevance, URL-level link evidence, and your own site evidence before making a competitive decision.',
    related: [
      { id: 'link-evidence', reason: 'Adds bounded referring-link evidence.' },
      { id: 'serp-results', reason: 'Checks a current result snapshot.' },
      { id: 'domain-overview', reason: 'Adds search-footprint estimates.' },
    ],
  },
  'ranked-keywords': {
    readOrder: [
      'dataStatus, market, coverage, request filters, cache, cost, and warnings',
      'evidence.imports file dates, hashes, fields, row quality, and caps when present',
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
      'evidence.imports file dates, hashes, fields, row quality, and caps when present',
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
      { id: 'competitor-keyword-gap', reason: 'Classifies possible gaps.' },
    ],
  },
  'serp-competitors': {
    readOrder: [
      'dataStatus, market, querySetSize, coverage, request, cache, and cost',
      'evidence.imports file dates, hashes, fields, row quality, and caps when present',
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
      'topFixes AND reviewObservations together; the two lists are the complete grouped issue inventory, so carry every group from both into findings',
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
