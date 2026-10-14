// Report entry points for the hosted MCP, which runs in a Cloudflare Worker.
// The `*Analysis` style functions take rows that the caller fetched. The
// `*With` report functions are the same reports the CLI runs, with Search
// Console access, page access and the clock injected by the caller. This
// entry must not reach the local token, cache, storage or browser code;
// hosted-bundle.test.ts enforces that.

export type {
  PageExtractor,
  PageFetcher,
  QueryContentVerifier,
  VerifyQueryContentInput,
} from './analyze/content-coverage-analysis.js'
export {
  requirePageVerification,
  verifyQueryContentWith,
} from './analyze/content-coverage-analysis.js'
export { analyzeCtrUnderperformersFromRows } from './analyze/ctr-underperformers-analysis.js'
export {
  type CtrUnderperformerDependencies,
  type CtrUnderperformersInput,
  type CtrUnderperformersReport,
  ctrUnderperformersReportWith,
} from './analyze/ctr-underperformers-report.js'
export {
  collapseFragmentPageRows,
  type FragmentCollapseProvenance,
  type FragmentCollapseResult,
  stripPageFragment,
} from './analyze/page-fragments.js'
export { analyzeQueryClustersFromRows } from './analyze/query-cluster-analysis.js'
export {
  isLikelyAutomatedQuery,
  isLikelyNavigationalOtherQuery,
  QUERY_FLAG_METHOD,
  type QueryFlag,
  queryFlags,
} from './analyze/query-quality.js'
export { analyzeSecondPageRows } from './analyze/second-page-analysis.js'
export type { SecondPageReport } from './analyze/second-page-analysis-types.js'
export {
  type SecondPageDependencies,
  type SecondPageInput,
  secondPageWith,
} from './analyze/second-page-report.js'
export {
  CTR_SPLIT_POSITION,
  createSiteCtrCurve,
  SITE_CTR_CURVE_METHOD,
} from './analyze/site-ctr-curve.js'
export { analyzeCannibalRows } from './analyze/site-diagnostics/cannibal-analysis.js'
export {
  type CannibalDependencies,
  type CannibalSearchConsoleInput,
  cannibalReportWith,
} from './analyze/site-diagnostics/cannibal-report.js'
export type { CannibalReport } from './analyze/site-diagnostics/cannibal-types.js'
export { analyzeDecay } from './analyze/site-diagnostics/decay-analysis.js'
export { decayComparisonRange } from './analyze/site-diagnostics/decay-report-input.js'
export type { DecayReport } from './analyze/site-diagnostics/decay-types.js'
export {
  type DecayingDependencies,
  type DecayingReportInput,
  decayingReportWith,
} from './analyze/site-diagnostics/decaying-report.js'
export { analyzeQuickWinsFromRows } from './analyze/site-diagnostics/quick-wins-analysis.js'
export {
  type QuickWinsDependencies,
  type QuickWinsInput,
  type QuickWinsReport,
  quickWinsReportWith,
} from './analyze/site-diagnostics/quick-wins-report.js'
export { analyzeStrikingDistanceRows } from './analyze/striking-distance-analysis.js'
export {
  type StrikingDistanceDependencies,
  type StrikingDistanceInput,
  type StrikingDistanceReport,
  strikingDistanceWith,
} from './analyze/striking-distance-report.js'
export type { TrafficAnomalyReport } from './analyze/traffic-anomaly-analysis.js'
export {
  analyzeTrafficAnomalyRows,
  interpretUpdateCorrelation,
} from './analyze/traffic-anomaly-analysis.js'
export {
  type TrafficAnomalyDependencies,
  type TrafficAnomalyInput,
  trafficAnomalyWith,
} from './analyze/traffic-anomaly-report.js'
export { deriveBrandTerms, isBrandQuery, registrableDomain } from './brand.js'
export {
  type BrandTermEvidence,
  type BrandTermsFromQueryRows,
  brandTermsFromQueryRows,
  type ExcludedBrandTerm,
  NAVIGATIONAL_STEM_THRESHOLDS,
  type ReportBrandTerms,
  resolveReportBrandTerms,
} from './brand-evidence.js'
export type {
  SearchAnalyticsOptions,
  SearchAnalyticsQuery,
  SearchAnalyticsRequest,
  SearchAnalyticsResult,
} from './gsc/client/types.js'
export {
  finalGscDateRange,
  latestFinalGscDate,
  shiftIsoDate,
} from './gsc/dates.js'
export type { GscRow } from './types.js'
export {
  findOverlappingSearchUpdates,
  searchUpdatesFromIncidents,
} from './updates/search-updates.js'
export { SEO_VERSION } from './version.js'
export * from './commands/index.js'
