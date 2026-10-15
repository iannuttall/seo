import type { ReportBrandTerms } from '../brand-evidence.js'
import type { GscRow } from '../types.js'
import type { MinImpressionsPolicy } from './min-impressions-policy.js'
import type { PageTemplate } from './page-patterns.js'
import type { QUERY_FLAG_METHOD, QueryFlag } from './query-quality.js'

export type StrikingDistanceSelection = {
  sourceRows: number
  /** Source rows whose page URL had a #fragment; merged into the base URL. */
  fragmentRows: number
  /** Source rows merged into another row after fragment removal. */
  mergedRows: number
  invalidRows: number
  outsidePositionRows: number
  belowMinimumRows: number
  lowActionabilityRows: number
  brandRows: number
  eligibleRows: number
  likelyAutomatedRows: number
  navigationalOtherRows: number
  flaggedRows: number
  returnedRows: number
  limitedRows: number
}

export type StrikingDistancePriority = {
  method: 'impressions_x_position_proximity'
  score: number
  demandImpressions: number
  positionProximity: number
  heuristic: true
  estimatedClickLift: false
}

export type StrikingDistanceRecommendation = {
  type:
    | 'investigate-ranking'
    | 'review-page-evidence'
    | 'fix-technical'
    | 'verification-failed'
  confidence: 'low' | 'medium'
  evidence: string
  action: string
}

export type StrikingDistanceAnalysisItem = {
  query: string
  url: string
  template: PageTemplate
  clicks: number
  impressions: number
  ctr: number
  position: number
  /** Heuristic labels; flagged rows rank after unflagged rows. */
  queryFlags: QueryFlag[]
  priority: StrikingDistancePriority
  recommendation: StrikingDistanceRecommendation
}

export type StrikingDistanceAnalysisGroup = {
  id: string
  label: string
  template: PageTemplate
  rowCount: number
  uniqueUrls: number
  uniqueQueries: number
  totalImpressions: number
  bestPosition: number
  impressionWeightedPosition: number
  sampleQueries: string[]
  sampleUrls: string[]
  actionScope: 'shared-template-candidate' | 'page-level-review'
  recommendation: StrikingDistanceRecommendation
}

export type StrikingDistanceAnalysis = {
  site: string
  minImpressions: number
  minImpressionsPolicy: MinImpressionsPolicy
  limit: number
  dataStatus: 'empty' | 'filtered' | 'available'
  brand: ReportBrandTerms
  selection: StrikingDistanceSelection
  methodology: {
    id: 'gsc_striking_distance_v2'
    source: 'google_search_console_query_page_rows'
    position: { minimumExclusive: 10; maximumInclusive: 20 }
    ctrEligibilityFilter: false
    priority: {
      method: 'impressions_x_position_proximity'
      formula: 'impressions * clamp((21 - position) / 10, 0.1, 1)'
      heuristic: true
      estimatedClickLift: false
    }
    queryFlags: typeof QUERY_FLAG_METHOD
    grouping: {
      population: 'all_eligible_rows_before_limit'
      sharedTemplateMinimumUniqueUrls: 2
      lowConfidenceTemplatesAreShared: false
    }
  }
  provenance: {
    inputScope: 'provided_rows'
    selectionOrder: readonly [
      'fragment_and_duplicate_merge',
      'valid_row',
      'position',
      'minimum_impressions',
      'query_quality',
      'brand',
      'query_flag_ranking',
    ]
    selection: StrikingDistanceSelection
  }
  summary: {
    eligibleRows: number
    returnedRows: number
    eligibleImpressions: number
    returnedImpressions: number
    uniqueEligibleUrls: number
    uniqueEligibleQueries: number
    groups: number
  }
  groups: StrikingDistanceAnalysisGroup[]
  items: StrikingDistanceAnalysisItem[]
}

export type AnalyzeStrikingDistanceInput = {
  rows: GscRow[]
  site: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}
