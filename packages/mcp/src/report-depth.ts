import { REPORT_DEPTH_CONTINUED } from './report-depth-continued.js'

export type RelatedReport = {
  id: string
  reason: string
}

export type ReportDepth = {
  readOrder: readonly string[]
  doNotClaim: readonly string[]
  verify: string
  related: readonly RelatedReport[]
}

const REPORT_DEPTH_PRIMARY = {
  'affected-urls': {
    readOrder: [
      'dataSources for provider availability',
      'selection totalMatchedRows, returnedRows, and truncated',
      'the requested rule, category, and severity filters',
      'each row rule, category, severity, and crawler evidence',
      'warnings and caveats',
    ],
    doNotClaim: [
      'A capped or partial crawl only supports "affected among evaluated pages", not sitewide.',
      'Unavailable clicks, impressions, or sessions are not a real zero.',
      'truncated true means more matching issue rows exist than were returned.',
    ],
    verify:
      'Re-run the same bounded crawl after deployment and confirm the rule no longer triggers on the affected URLs.',
    related: [
      { id: 'explain-crawl-issue', reason: 'Explains the rule before fixes.' },
      { id: 'top-fixes', reason: 'Ranks issues when there are too many.' },
      { id: 'crawl-report', reason: 'Opens the source crawl snapshot.' },
    ],
  },
  'agent-readiness': {
    readOrder: [
      'profile, profileApplicability, dataStatus, and crawl caveats',
      'summary and topActions',
      'HTML and Markdown representation checks with affected URLs',
      'Agent Skills, llms.txt, route manifest, crawler access, and identity evidence',
    ],
    doNotClaim: [
      'A clean content profile is not proof of indexing, rankings, AI mentions, citations, or selection.',
      'API, application, and commerce checks marked notApplicable were outside this content-site run. They did not fail.',
      'An allowed crawler token does not prove that a service fetched or used the page.',
      'Optional discovery files are not Google ranking requirements.',
    ],
    verify:
      'Run the same content profile against the same public route scope after deployment and confirm each failed or warning check changed.',
    related: [
      { id: 'ai-readiness', reason: 'Checks AI search technical eligibility.' },
      { id: 'llms-txt-audit', reason: 'Inspects llms.txt in more detail.' },
      { id: 'entity-readiness', reason: 'Reviews identity evidence.' },
      { id: 'site-crawl', reason: 'Creates a reusable crawl baseline.' },
    ],
  },
  'ai-readiness': {
    readOrder: [
      'dataStatus and crawl caveats',
      'each check evaluated flag',
      'hard access, indexability, and snippet conflicts',
      'semantic structure and answerable content as observations',
    ],
    doNotClaim: [
      'unknown means evidence was unavailable, not a pass or a fail.',
      'Valid JSON-LD is syntax evidence, not entity recognition or rich-result eligibility.',
      'A clean report is not indexing, ranking, AI visibility, selection, or citations.',
    ],
    verify:
      'Re-crawl at the same scope after a change and confirm the access or indexability signal resolved.',
    related: [
      { id: 'geo-gaps', reason: 'Lists affected URLs for access rules.' },
      { id: 'entity-readiness', reason: 'Reviews identity signals.' },
      { id: 'ai-search-scorecard', reason: 'Scores the same evidence.' },
    ],
  },
  'ai-referrals': {
    readOrder: [
      'dataStatus, range, methodology, and dataSource partialReasons',
      'possiblyTruncated and per-query statuses',
      'selection.landingPages before treating landingPages as complete',
      'sources observedSessionSources for attribution evidence',
    ],
    doNotClaim: [
      'An empty result is not proof that no AI system sent or cited the site.',
      'Referral sessions did not necessarily cause conversions and are not all AI traffic.',
      'totalUsers is not additive and must not be reconstructed by summing rows.',
    ],
    verify:
      'Compare complete like-for-like GA4 periods and check whether high-session landing pages answer the referring context.',
    related: [
      { id: 'seo-to-ai-query', reason: 'Builds monitoring prompts.' },
      { id: 'ai-readiness', reason: 'Checks technical AI access.' },
    ],
  },
  'ai-search-scorecard': {
    readOrder: [
      'partial, crawlComplete, and excluded before the number',
      'score, which is null when no check had known evidence',
      'each check status, observed evidence, and finding',
      'methodology weights, statusCredit, and formula',
    ],
    doNotClaim: [
      "The score is a heuristic over this tool's own checks, not a Google or AI-engine requirement, eligibility verdict, or ranking prediction.",
      'unknown checks are excluded from the score and are never failures.',
      'A blocked AI crawler token can be an intentional publisher choice.',
    ],
    verify:
      'Re-crawl at the same scope after a change and confirm the per-check evidence moved.',
    related: [
      { id: 'ai-readiness', reason: 'Gives the per-page evidence.' },
      { id: 'geo-gaps', reason: 'Lists affected URLs.' },
      { id: 'entity-readiness', reason: 'Reviews identity signals.' },
    ],
  },
  'audit-page': {
    readOrder: [
      'fetchDiagnostics, warnings, and the final fetched URL',
      'observed page fields and structured-data findings',
      'issues and recommendations',
    ],
    doNotClaim: [
      'One page cannot support a sitewide conclusion.',
      'Title pixel width is a review estimator, not a Google limit.',
      'The fetched version is not proof that Google indexed that version.',
    ],
    verify:
      'Re-fetch the URL after the edit and confirm the observed field changed.',
    related: [
      { id: 'redirect-trace', reason: 'Debugs the redirect chain.' },
      { id: 'performance-audit', reason: 'Adds page speed evidence.' },
      { id: 'content-optimization', reason: 'Builds a query-led brief.' },
    ],
  },
  'audit-urls': {
    readOrder: [
      'requested versus attempted, fetched, failed, retained, and omitted counts',
      'response evidence and issue summaries',
      'requestEvidenceStatus, warnings, and caveats',
    ],
    doNotClaim: [
      'A successful sample does not prove the same template works everywhere.',
      'A failed request may be transient network, not a persistent defect.',
      'A bounded audit is never complete site coverage.',
    ],
    verify:
      'Re-run the identical URL list after deployment; a URL dropped from the request is not a verified fix.',
    related: [
      { id: 'audit-page', reason: 'Inspects one page in depth.' },
      { id: 'site-crawl', reason: 'Discovers pages instead.' },
      { id: 'redirect-trace', reason: 'Traces a redirecting URL.' },
    ],
  },
  cannibalisation: {
    readOrder: [
      'dataStatus and both source.pageExposure and source.propertyDemand with validation counts and completeness',
      'selection to see why groups were excluded or suppressed',
      'per-page clicks, impressions, position, impression share, reviewContext, and HHI',
      'priority.score and suggestedOwnerUrl',
    ],
    doNotClaim: [
      'URL overlap is a review candidate, not proven harmful cannibalisation.',
      'suggestedOwnerUrl is a low-confidence mechanical pick that requires intent review.',
      'priority.score is a heuristic, not estimated click lift, and a partial source cannot support an all-clear.',
    ],
    verify:
      'Compare intent and live SERPs for the overlapping URLs before consolidating anything.',
    related: [
      { id: 'query-clusters', reason: 'Groups related query themes.' },
      { id: 'internal-links', reason: 'Clarifies link ownership.' },
      { id: 'content-optimization', reason: 'Differentiates page intent.' },
    ],
  },
  'community-intent': {
    readOrder: [
      'dataStatus, source.completeness, warnings, and caveats',
      'selection.classifiedRows for every match and selection.returnedRows for the limited set',
      'per-item intent, signals, and matchedTerms',
    ],
    doNotClaim: [
      'Intent labels are low-confidence English language heuristics, not verified intent.',
      'The classifier does not inspect the live SERP or identify the ranking URL.',
      'A capped or partial zero is inconclusive, not absence of demand.',
    ],
    verify:
      'Retrieve GSC query and page rows to find the ranking URL and check its content against the observed query language.',
    related: [
      { id: 'content-optimization', reason: 'Turns intent into a brief.' },
      { id: 'query-clusters', reason: 'Groups the demand themes.' },
      { id: 'page-opportunities', reason: 'Reviews one ranking URL.' },
    ],
  },
  'compare-crawls': {
    readOrder: [
      'comparability.status and its matching flags',
      'before and after preserved config, requestScope, and caps',
      'top-level completeness and truncated reason codes',
      'summary, pageChanges, and issueChanges',
    ],
    doNotClaim: [
      'An absent page from a capped, skipped, failed, or differently scoped crawl is not proven removed.',
      'Source row caps limit joined GSC or GA4 evidence even when the document crawl completed.',
      'A change between snapshots is not proof the release caused it.',
    ],
    verify:
      'Re-run the same definition and request scope after deployment and confirm the delta.',
    related: [
      { id: 'crawl-diff', reason: 'Compares against the previous run.' },
      { id: 'crawl-history', reason: 'Finds saved report ids.' },
      { id: 'affected-urls', reason: 'Lists URLs for a changed rule.' },
    ],
  },
  'content-optimization': {
    readOrder: [
      'sourceReport dataStatus, selection, benchmark.possiblyTruncated, and verification.status',
      'summary.score and primaryIntent as heuristics',
      'topActions separating technical-check and unverified from verified observations',
      'intentMix and the source query metrics',
    ],
    doNotClaim: [
      'estimatedClickLift and score are prioritisation heuristics, not forecasts or quality grades.',
      'Query wording is not a content mandate.',
      'Adding suggested wording is not guaranteed traffic.',
    ],
    verify:
      'Fetch the page after the edit and confirm the missing answer block or clearer framing is present.',
    related: [
      { id: 'page-opportunities', reason: 'Adds query-level opportunities.' },
      { id: 'internal-links', reason: 'Finds contextual links.' },
      { id: 'quick-wins', reason: 'Ranks CTR opportunities.' },
    ],
  },
  'crawl-diff': {
    readOrder: [
      'run versus previousRun, where a missing previous run means a baseline',
      'start URL, limit, counts, timestamps, rendering, and warnings for both runs',
      'summary counts traced into items before, after, and changes',
      'recommendations as review actions',
    ],
    doNotClaim: [
      'A removed URL may be outside the current discovered set or limit rather than deleted.',
      'A fetch or extraction failure cannot support a resolved issue.',
      'A bounded diff is not an inventory-wide audit and does not show ranking impact.',
    ],
    verify:
      'Repeat with comparable scope after a fix and confirm the changed item.',
    related: [
      { id: 'compare-crawls', reason: 'Compares two explicit snapshots.' },
      { id: 'technical-watch', reason: 'Runs a recurring watch.' },
      { id: 'affected-urls', reason: 'Lists URLs for a rule.' },
    ],
  },
  'crawl-history': {
    readOrder: [
      'each report id, site, start URL, creation time, and status',
      'total pages and issue count',
      'configuration hash and storage version',
    ],
    doNotClaim: [
      'Counts are orientation metadata, not severity or completeness.',
      'A smaller page count could reflect a scope change, cap, or failure, not a real site change.',
      'A saved list can expose stale data.',
    ],
    verify:
      'Load a chosen id with crawl-report and inspect its caveats before analysis.',
    related: [
      { id: 'crawl-report', reason: 'Loads a saved snapshot.' },
      { id: 'compare-crawls', reason: 'Compares two snapshots.' },
      { id: 'site-crawl', reason: 'Creates a new crawl.' },
    ],
  },
  'crawl-report': {
    readOrder: [
      'id, source URL and site, generatedAt, definition id, config hash, status, and requestEvidenceStatus',
      'summary counts and pageLimitReached',
      'data sources, warnings, and caveats',
    ],
    doNotClaim: [
      'A report can be internally valid yet stale, capped, or partial and cannot prove the current live state.',
      'Loading a report is a local storage read, not a fresh check.',
    ],
    verify:
      'Run a new crawl with the same configuration and retain both report ids to confirm a change.',
    related: [
      { id: 'top-fixes', reason: 'Ranks the issue queue.' },
      { id: 'affected-urls', reason: 'Lists URLs for a rule.' },
      { id: 'compare-crawls', reason: 'Compares two snapshots.' },
    ],
  },
  'crawler-rules': {
    readOrder: [
      'each rule id, title, and category',
      'default severity as triage metadata',
      'guidance metadata',
    ],
    doNotClaim: [
      'Listing a rule does not mean the site triggered it or that the convention is a search-engine requirement.',
      'Default severity is generic triage metadata, not actual priority.',
      'Similarly named rules may not share source semantics.',
    ],
    verify:
      'Pass the exact rule id to explain-crawl-issue or affected-urls to confirm it applies to real evidence.',
    related: [
      { id: 'explain-crawl-issue', reason: 'Returns the rule contract.' },
      { id: 'affected-urls', reason: 'Returns crawl evidence for a rule.' },
    ],
  },
  'ctr-underperformers': {
    readOrder: [
      'dataStatus, range, source.completeness, possiblyTruncated, and validation counts',
      'selection before the queue',
      'per-item query, URL, impressions, position, observed CTR, target CTR, and benchmark source',
      'estimated shortfall',
    ],
    doNotClaim: [
      'The shortfall is directional prioritisation math, not a traffic forecast.',
      'Page-one average position hides day, device, geography, and result-feature variation.',
      'A partial empty result is not an all-clear.',
    ],
    verify:
      'Inspect the current SERP and displayed title link, then compare a complete later period after testing framing.',
    related: [
      { id: 'quick-wins', reason: 'Ranks position 4-10 opportunities.' },
      { id: 'page-opportunities', reason: 'Reviews one URL.' },
      { id: 'content-optimization', reason: 'Builds a page brief.' },
    ],
  },
  'decaying-pages': {
    readOrder: [
      'dataStatus, ranges, and source.completeness',
      'current and previous fetched rows, caps, truncation, and invalid rows in selection',
      'summary.observedRetainedQueryClickLoss versus the returned subset',
      'per-item clicks, impressions, CTR, position, and signals',
    ],
    doNotClaim: [
      'A diagnosis such as lost_position or lost_ctr labels correlated movement, not a cause.',
      'Missing retained rows are not zero traffic.',
      'Do not sum capped rows into a property-wide loss.',
    ],
    verify:
      'Check deployments, live indexability, and SERP composition for the affected URLs before editing.',
    related: [
      { id: 'refresh-priorities', reason: 'Combines decline signals.' },
      { id: 'segment-impact', reason: 'Shows where movement concentrates.' },
      { id: 'measure-change', reason: 'Evaluates a fix later.' },
    ],
  },
  'entity-readiness': {
    readOrder: [
      'dataStatus, evaluatedPages versus crawlPages, and caveats',
      'entities.schemaTypes',
      'sameAs, sameAsByType, and socialProfiles',
      'authors',
    ],
    doNotClaim: [
      'Checks are informational observations with coverage, not pass or fail requirements.',
      'Skipped or non-indexable pages are not evidence of absence.',
      'These signals do not prove Knowledge Graph inclusion, ownership, expertise, rankings, or citations.',
    ],
    verify:
      'Confirm names, URLs, authorship, and dates with the publisher, then re-crawl the same scope.',
    related: [
      { id: 'ai-readiness', reason: 'Checks technical AI access.' },
      { id: 'ai-search-scorecard', reason: 'Scores the evidence.' },
      { id: 'geo-gaps', reason: 'Lists affected URLs.' },
    ],
  },
  'explain-crawl-issue': {
    readOrder: [
      'category, default severity, and why it matters',
      'fix steps and ignored impact',
      'verification method and agent hints',
    ],
    doNotClaim: [
      'Guidance describes the checked condition, not a search-engine penalty or guaranteed ranking effect.',
      'Default severity is generic prioritization metadata, not actual urgency.',
      'The rule definition alone does not prove any page triggered it.',
    ],
    verify:
      'Pair the definition with affected-urls from the same saved crawl and confirm the per-URL evidence.',
    related: [
      { id: 'affected-urls', reason: 'Returns URLs for the rule.' },
      { id: 'crawler-rules', reason: 'Finds a rule id.' },
      { id: 'top-fixes', reason: 'Ranks the fix queue.' },
    ],
  },
  'generate-llms-txt': {
    readOrder: [
      'content, includedUrls, estimatedTokens, and sections',
      'the generated titles and descriptions against the source pages',
      'the source crawl date, cap, failures, and caveats',
    ],
    doNotClaim: [
      'Reaching maxUrls or the token budget is possible truncation, not a complete inventory.',
      'A valid draft does not prove search or AI benefit, selection, indexing, or citations.',
      'The crawler cannot determine publisher intent.',
    ],
    verify:
      'After human review, fetch the published file and validate its links with llms-txt-audit.',
    related: [
      { id: 'llms-txt-audit', reason: 'Audits the published file.' },
      { id: 'crawl-report', reason: 'Inspects the source crawl.' },
      { id: 'okf-build', reason: 'Builds a richer knowledge pack.' },
    ],
  },
  'geo-gaps': {
    readOrder: [
      'dataStatus, source.partialReasons, and selection evaluated, matched, returned, and truncated counts',
      'per-URL issues separated from searchEligibility',
      'access states, where null means unknown',
    ],
    doNotClaim: [
      'A null access state means unknown, not allowed.',
      'Semantic HTML and structured data do not override a hard access restriction or create eligibility.',
      'An empty gap list does not prove indexing, visibility, selection, or complete coverage; confirm intent before treating noindex, robots, canonicals, or snippet limits as defects.',
    ],
    verify:
      'Fix unintended response or access conflicts, then re-check the exact URL and directive after deployment.',
    related: [
      { id: 'ai-readiness', reason: 'Gives the readiness overview.' },
      { id: 'affected-urls', reason: 'Lists URLs for a rule.' },
      { id: 'index-coverage', reason: 'Checks index signals.' },
    ],
  },
  'index-coverage': {
    readOrder: [
      'sources completeness, rowLimit, rowLimitReached, date range, and invalid rows',
      'retainedSearchVisibility and crawlableWithoutRetainedSearchVisibility',
      'blockedOrNonIndexable, sitemapOnly, searchConsoleOnly, and templateReview',
      'each group count, returned, and omitted',
    ],
    doNotClaim: [
      'A page is not indexed because it had Search Analytics visibility, nor unindexed because no row appeared.',
      'A missing Search Analytics row is not proof a page is unindexed.',
      'Do not turn a limited or incomplete source into a whole-site coverage percentage.',
    ],
    verify:
      'Run index-watch on representative URLs to collect exact URL Inspection verdicts.',
    related: [
      { id: 'index-watch', reason: 'Collects URL Inspection evidence.' },
      { id: 'index-coverage-plan', reason: 'Plans quota when large.' },
      { id: 'site-crawl', reason: 'Provides the source crawl.' },
    ],
  },
  'index-coverage-plan': {
    readOrder: [
      'summary sitemapUrls, urlCount, property count, daily capacity, and estimated versus target cycle days',
      'properties allocations and sample URLs',
      'suggestions and every warning',
    ],
    doNotClaim: [
      'Estimated cycle time is arithmetic over discovered URLs and capacity, not a promise Google will process or index them.',
      'Sitemap fetch failures or maxUrls truncation make the plan incomplete.',
      'This plan does not report an index coverage percentage or an all-clear.',
    ],
    verify:
      'Use the plan to set a realistic recurring index-monitor limit and confirm allocations against properties you control.',
    related: [
      { id: 'index-monitor', reason: 'Collects the snapshots.' },
      { id: 'index-coverage', reason: 'Reviews index signals first.' },
      { id: 'index-watch', reason: 'Reviews index changes.' },
    ],
  },
  'index-monitor': {
    readOrder: [
      'dataStatus and source sitemap and inventory limits, discovered and invalid URLs, and truncation',
      'summary inventory states kept distinct',
      'properties allocation and execution',
      'items inspectionStatus, indexStatus, regressions, recoveries, and errors',
    ],
    doNotClaim: [
      'A due URL that was not selected has no new inspection result.',
      'Failed, deferred, or quota-blocked checks are operational outcomes, not SEO defects.',
      'A complete selected batch does not prove inventory-wide indexing or future inclusion.',
    ],
    verify:
      'Investigate regressions with a live page audit and the exact inspection evidence, and retry failed checks per retryAt.',
    related: [
      { id: 'index-watch', reason: 'Reviews index changes.' },
      { id: 'index-coverage-plan', reason: 'Plans quota allocation.' },
      { id: 'index-coverage', reason: 'Reviews coverage signals.' },
    ],
  },
  'index-watch': {
    readOrder: [
      'source.possiblyTruncated, dataStatus, warnings, and sitemap inventory states',
      'currentIssues, regressions, recoveries, failed, quotaBlocked, and deferred separately',
      'indexStatus, issueCodes, and typed changes',
    ],
    doNotClaim: [
      "URL Inspection is Google's indexed snapshot for one URL, not a live crawl or current search appearance.",
      'A NEUTRAL verdict or canonical difference may be intentional, not a defect.',
      'Do not infer inventory-wide health from the bounded selected sample; a provider 429 is authoritative over the local quota ledger.',
    ],
    verify:
      'Audit the live page, sitemap, and exact inspection evidence for any regression or current issue.',
    related: [
      { id: 'index-monitor', reason: 'Collects the snapshots.' },
      { id: 'index-coverage', reason: 'Reviews coverage signals.' },
      { id: 'index-coverage-plan', reason: 'Plans quota allocation.' },
    ],
  },
  'internal-links': {
    readOrder: [
      'dataStatus, target verification, aliases, canonical, and technical signals',
      'source completeness and selection attempted, checked, failed, unchecked, and exclusions',
      'per-item exact versus lexical matches and linkEvidence',
    ],
    doNotClaim: [
      'A low checkLimit can leave plausible candidates unchecked, so absence is not proven.',
      'Query overlap does not prove a link belongs or that adding one improves rankings.',
      'Priority is a heuristic, not estimated impact.',
    ],
    verify:
      'Read the source passage, add one contextual link if the target is genuinely useful, and re-crawl to confirm it.',
    related: [
      { id: 'cannibalisation', reason: 'Checks URL overlap.' },
      { id: 'content-optimization', reason: 'Builds a page brief.' },
      { id: 'page-opportunities', reason: 'Reviews one URL.' },
    ],
  },
  'link-recovery': {
    readOrder: [
      'range and summary.checked with severity totals',
      'per-item original and final URL, GSC metrics, issue lists, and redirect trace',
      'chain status, final-page indexability, canonicals, and warnings',
    ],
    doNotClaim: [
      'clicksAtRisk and impressionsAtRisk describe the checked period, not a forecast of loss or recovery.',
      'Prior visibility orders the queue but does not prove fixing a URL restores traffic.',
      'Failed checks or selection limits constrain coverage.',
    ],
    verify:
      'Add one direct 301 to the closest equivalent destination only after confirming the page should still exist, then re-trace.',
    related: [
      { id: 'redirect-trace', reason: 'Traces one URL chain.' },
      { id: 'decaying-pages', reason: 'Shows click declines.' },
      { id: 'audit-urls', reason: 'Runs bounded checks.' },
    ],
  },
  'llms-txt-audit': {
    readOrder: [
      'exists, resolved file URL, response status, headline, and issues',
      'recommendedPages',
      'the source crawl date, cap, partial state, failed requests, and caveats',
    ],
    doNotClaim: [
      'llms.txt presence is not a ranking signal and its absence is not a technical defect.',
      'A short recommendation list from a capped crawl is not sitewide evidence.',
      'Adding the file does not improve indexing, rankings, traffic, AI selection, or citations.',
    ],
    verify:
      'If the file exists, confirm its URLs are current, canonical, public, and aligned with publisher intent.',
    related: [
      { id: 'generate-llms-txt', reason: 'Drafts a new file.' },
      { id: 'crawl-report', reason: 'Inspects the source crawl.' },
      { id: 'okf-build', reason: 'Builds a knowledge pack.' },
    ],
  },
  'measure-change': {
    readOrder: [
      'dataStatus, window, source, warnings, and caveats',
      'window.effectiveDays versus requestedDays and afterWindowTruncated',
      'GSC before and after metrics',
      'GA4 source.analytics.status and timezone and any control adjusted deltas',
    ],
    doNotClaim: [
      'Timing does not prove the recorded change caused the movement.',
      'not-enough-data is never positive, negative, or flat, and the delta must not be annualized or forecast.',
      'clickPct null means the before value was zero, not an infinite gain.',
    ],
    verify:
      'Use equal whole-day before and after windows with at least 7 finalized days each before reading a directional verdict.',
    related: [
      { id: 'segment-impact', reason: 'Shows where movement sits.' },
      { id: 'decaying-pages', reason: 'Shows click declines.' },
      { id: 'update-postmortem', reason: 'Frames movement around an update.' },
    ],
  },
} satisfies Record<string, ReportDepth>

export const REPORT_DEPTH = {
  ...REPORT_DEPTH_PRIMARY,
  ...REPORT_DEPTH_CONTINUED,
} satisfies Record<string, ReportDepth>
