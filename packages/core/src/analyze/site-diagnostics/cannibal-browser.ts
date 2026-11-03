// The cannibalization rules `seo report --section cannibalization` uses, for
// the seoskill.dev checker. Browser-safe: no Node built-ins and no network.

export {
  analyzeCannibalRows,
  CANNIBAL_MAXIMUM_DOMINANT_SHARE,
  CANNIBAL_MINIMUM_PAGE_IMPRESSIONS,
  CANNIBAL_MINIMUM_PAGE_SHARE,
  cannibalDataStatus,
} from './cannibal-analysis.js'
export type {
  CannibalAnalysis,
  CannibalItem,
  CannibalPage,
  CannibalReport,
} from './cannibal-types.js'
