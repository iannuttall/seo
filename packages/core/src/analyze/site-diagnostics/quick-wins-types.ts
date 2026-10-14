import type { ReportBrandTerms } from '../../brand-evidence.js'
import type { GscRow, Recommendation } from '../../types.js'
import type { QueryContentCoverage } from '../content-coverage.js'
import type { MinImpressionsPolicy } from '../min-impressions-policy.js'
import type { PageTemplate } from '../page-patterns.js'
import type { QUERY_FLAG_METHOD, QueryFlag } from '../query-quality.js'
import type { SITE_CTR_CURVE_METHOD } from '../site-ctr-curve.js'

export type QuickWinSelection = {
  sourceRows: number
  invalidRows: number
  /** Source rows whose page URL had a #fragment; merged into the base URL. */
  fragmentRows: number
  /** Rows merged into another row with the same query and base URL. */
  duplicateRows: number
  aggregatedRows: number
  outsideBenchmarkPositionRows: number
  lowActionabilityRows: number
  brandRows: number
  benchmarkRows: number
  outsideCandidatePositionRows: number
  belowMinimumRows: number
  atOrAboveTargetRows: number
  eligibleRows: number
  /** Eligible rows with the heuristic likely-automated flag. */
  likelyAutomatedRows: number
  /** Eligible rows with the heuristic navigational-other flag. */
  navigationalOtherRows: number
  flaggedRows: number
  returnedRows: number
  limitedRows: number
}

export type QuickWinBenchmark = {
  targetCtr: number
  source: string
  samplePopulation: 'all_qualified_url_samples'
  peerRows: number
  peerImpressions: number
  qualifiedPeerImpressions: number
  urlSamples: number
  positiveUrlSamples: number
  excludedTargetRows: number
  leaveOut: 'target_url'
  confidence: 'site-data' | 'fallback'
  heuristic: true
}

export interface QuickWinItem {
  query: string
  url: string
  template: PageTemplate
  position: number
  clicks: number
  impressions: number
  ctr: number
  targetCtr: number
  benchmark: QuickWinBenchmark
  /** Heuristic labels; flagged rows rank after unflagged rows. */
  queryFlags: QueryFlag[]
  estimatedCtrClickShortfall: number
  priority: {
    method: 'impressions_x_target_ctr_shortfall'
    score: number
    heuristic: true
    estimatedClickLift: false
  }
  finding: 'ctr-target-shortfall' | QueryContentCoverage['classification']
  contentVerification?: QueryContentCoverage
  recommendation: Recommendation
}

export interface QuickWinGroup {
  id: string
  label: string
  query: string
  template: PageTemplate
  rowCount: number
  urlCount: number
  totalEstimatedCtrClickShortfall: number
  totalImpressions: number
  sampleUrls: string[]
  recommendation: string
}

export type QuickWinTemplateRecommendation = {
  templateId: string
  templateLabel: string
  rowCount: number
  urlCount: number
  totalEstimatedCtrClickShortfall: number
  totalImpressions: number
  action: string
  evidence: string
}

export type QuickWinAnalysis = {
  site: string
  minImpressions: number
  minImpressionsPolicy: MinImpressionsPolicy
  limit: number
  dataStatus: 'empty' | 'filtered' | 'available'
  selection: QuickWinSelection
  methodology: {
    id: 'gsc_quick_wins_v2'
    source: 'google_search_console_query_page_rows'
    position: {
      metric: 'gsc_average_position'
      minimumInclusive: 4
      maximumInclusive: 10
    }
    benchmark: typeof SITE_CTR_CURVE_METHOD
    priority: {
      method: 'impressions_x_target_ctr_shortfall'
      formula: 'impressions * max(0, target CTR - observed CTR)'
      heuristic: true
      estimatedClickLift: false
    }
    queryFlags: typeof QUERY_FLAG_METHOD
  }
  brand: ReportBrandTerms
  provenance: {
    inputScope: 'provided_rows'
    selectionOrder: readonly [
      'valid_row',
      'fragment_and_duplicate_merge',
      'benchmark_position',
      'query_quality',
      'brand',
      'candidate_position',
      'minimum_impressions',
      'target_ctr_shortfall',
      'query_flag_ranking',
      'limit',
    ]
    selection: QuickWinSelection
  }
  summary: {
    eligibleRows: number
    returnedRows: number
    eligibleImpressions: number
    returnedImpressions: number
    eligibleEstimatedCtrClickShortfall: number
    returnedEstimatedCtrClickShortfall: number
    uniqueEligibleUrls: number
    uniqueEligibleQueries: number
  }
  items: QuickWinItem[]
  eligibleItems: QuickWinItem[]
  benchmarkByPosition: Record<
    string,
    import('../opportunity-primitives.js').PositionBenchmark
  >
}

export type AnalyzeQuickWinsInput = {
  rows: GscRow[]
  site: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}
