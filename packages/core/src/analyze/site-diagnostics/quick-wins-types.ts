import type { GscRow, Recommendation } from '../../types.js'
import type { QueryContentCoverage } from '../content-coverage.js'
import type { PageTemplate } from '../page-patterns.js'

export type QuickWinSelection = {
  sourceRows: number
  invalidRows: number
  outsideBenchmarkPositionRows: number
  lowActionabilityRows: number
  brandRows: number
  benchmarkRows: number
  outsideCandidatePositionRows: number
  belowMinimumRows: number
  atOrAboveTargetRows: number
  eligibleRows: number
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
    benchmark: {
      method: 'position_bucket_url_p75_v2'
      samplePopulation: 'all_qualified_url_samples'
      leaveOut: 'target_url'
      minimumUrlImpressions: 30
      minimumQualifiedImpressions: 1000
      minimumUrlSamples: 5
      minimumPositiveUrlSamples: 3
      fallback: {
        id: 'seo_builtin_position_ctr'
        version: 1
        kind: 'built_in_heuristic'
        curve: Record<string, number>
      }
      heuristic: true
    }
    priority: {
      method: 'impressions_x_target_ctr_shortfall'
      formula: 'impressions * max(0, target CTR - observed CTR)'
      heuristic: true
      estimatedClickLift: false
    }
  }
  provenance: {
    inputScope: 'provided_rows'
    selectionOrder: readonly [
      'valid_row',
      'benchmark_position',
      'query_quality',
      'brand',
      'candidate_position',
      'minimum_impressions',
      'target_ctr_shortfall',
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
