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
      'Compare complete like-for-like Google Analytics periods and check whether high-session landing pages answer the referring context.',
    related: [],
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
      'topFixes AND reviewObservations together; the two lists are the complete grouped issue inventory, so carry every group from both into findings',
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
      'dataSource plus evidence.imports file dates, hashes, and row quality when the run used researchFiles',
    ],
    doNotClaim: [
      'URL overlap is a review candidate, not proven harmful cannibalisation.',
      'suggestedOwnerUrl is a low-confidence mechanical pick that requires intent review.',
      'priority.score is a heuristic, not estimated click lift, and a partial source cannot support an all-clear.',
      'Research-import rows are provider estimates that support multiple-ranking-URL claims only, not traffic or Search Console-verified cannibalisation.',
    ],
    verify:
      'Compare intent and live SERPs for the overlapping URLs before consolidating anything.',
    related: [
      { id: 'query-clusters', reason: 'Groups related query themes.' },
      { id: 'internal-links', reason: 'Clarifies link ownership.' },
      { id: 'content-optimization', reason: 'Differentiates page intent.' },
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
      'Pass the exact rule id to explain-crawl-issue, then check the matching issues in a site crawl.',
    related: [
      { id: 'explain-crawl-issue', reason: 'Returns the rule contract.' },
    ],
  },
  'ctr-underperformers': {
    readOrder: [
      'dataStatus, range, source.completeness, possiblyTruncated, and validation counts',
      'brand terms used, then selection before the queue; rows at average position 4 or worse belong to quick-wins',
      'per-item query, URL, impressions, position, observed CTR, target CTR, benchmark source, and queryFlags',
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
      'Pair the definition with the matching issues from a site crawl and confirm the per-URL evidence.',
    related: [
      { id: 'crawler-rules', reason: 'Finds a rule id.' },
      { id: 'top-fixes', reason: 'Ranks the fix queue.' },
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
      'Run seo page --url on representative URLs to collect exact URL Inspection verdicts.',
    related: [{ id: 'site-crawl', reason: 'Provides the source crawl.' }],
  },
  'internal-links': {
    readOrder: [
      'dataStatus, target verification, aliases, canonical, and technical signals',
      'source completeness and selection attempted, checked, failed, unchecked, and exclusions',
      'per-item exact versus lexical matches and linkEvidence',
      'per-item placement: the sentence where a link fits, its anchors, and contentSimilarity',
    ],
    doNotClaim: [
      'A low checkLimit can leave plausible candidates unchecked, so absence is not proven.',
      'Query overlap does not prove a link belongs or that adding one improves rankings.',
      'Priority is a heuristic, not estimated impact.',
      'Placement sentences, anchors and contentSimilarity are text heuristics; they do not prove the link helps a reader.',
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
} satisfies Record<string, ReportDepth>

export const REPORT_DEPTH = {
  ...REPORT_DEPTH_PRIMARY,
  ...REPORT_DEPTH_CONTINUED,
} satisfies Record<string, ReportDepth>
