import type {
  GscRow,
  PageFetchDiagnostics,
  QueryContentCoverage,
} from '../types/pages.js'
import type { PageTemplate } from './page-patterns.js'

export type SecondPageSelection = {
  sourceRows: number
  invalidRows: number
  outsidePositionRows: number
  brandRows: number
  eligibleRows: number
  sourcePages: number
  belowMinimumPages: number
  eligiblePages: number
  returnedPages: number
  limitedPages: number
}

export type SecondPageQuery = {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type SecondPageRecommendation = {
  type:
    | 'investigate-ranking'
    | 'fix-technical'
    | 'fix-content-gap'
    | 'improve-serp-framing'
    | 'inspect-fetch'
  confidence: 'low' | 'medium'
  evidence: string
  action: string
}

export type SecondPageItem = {
  url: string
  primaryQuery: string
  template: PageTemplate
  queries: SecondPageQuery[]
  queryCount: number
  clicks: number
  impressions: number
  ctr: number
  position: number
  priority: {
    method: 'impressions_x_position_proximity'
    score: number
    demandImpressions: number
    positionProximity: number
    heuristic: true
    estimatedClickLift: false
  }
  finding: SecondPageRecommendation['type'] | 'unverified'
  recommendation: SecondPageRecommendation
  contentVerification?: QueryContentCoverage
  fetchDiagnostics?: PageFetchDiagnostics
}

export type SecondPageAnalysis = {
  site: string
  minImpressions: number
  limit: number
  dataStatus: 'empty' | 'filtered' | 'available'
  selection: SecondPageSelection
  methodology: {
    id: 'gsc_second_page_v2'
    source: 'google_search_console_query_page_rows'
    position: {
      metric: 'gsc_average_position'
      minimumExclusive: 10
      maximumInclusive: 20
      appliedAt: 'query_page_row'
    }
    aggregation: {
      unit: 'page'
      minimumImpressionsAppliedAt: 'eligible_page_aggregate'
      ctr: 'sum_clicks_divided_by_sum_impressions'
      position: 'impression_weighted_query_page_position'
      queries: 'all_eligible_queries_retained'
    }
    priority: {
      method: 'impressions_x_position_proximity'
      formula: 'page impressions * clamp((21 - weighted position) / 10, 0.1, 1)'
      heuristic: true
      estimatedClickLift: false
    }
  }
  provenance: {
    inputScope: 'provided_rows'
    selectionOrder: readonly [
      'valid_row',
      'position',
      'brand',
      'page_aggregation',
      'minimum_page_impressions',
      'priority',
      'limit',
    ]
    selection: SecondPageSelection
  }
  summary: {
    eligiblePages: number
    returnedPages: number
    eligibleTemplates: number
    returnedTemplates: number
    eligibleQueries: number
    returnedQueries: number
    eligibleClicks: number
    eligibleImpressions: number
    returnedClicks: number
    returnedImpressions: number
  }
  items: SecondPageItem[]
}

export type AnalyzeSecondPageInput = {
  rows: GscRow[]
  site: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}

export type SecondPageReport = {
  site: string
  range: number
  dateRange: { startDate: string; endDate: string }
  generatedAt: string
  source: {
    provider: 'google-search-console'
    dimensions: ['query', 'page']
    searchType: 'web'
    dataState: 'final'
    rowsFetched: number
    calls: number
    maxRows: number
    possiblyTruncated: boolean
    completeness: 'retained-query-rows-only'
  }
  dataStatus: SecondPageAnalysis['dataStatus']
  selection: SecondPageSelection
  methodology: SecondPageAnalysis['methodology']
  provenance: SecondPageAnalysis['provenance'] & {
    verification: {
      optional: true
      population: 'returned_pages_in_priority_order'
    }
  }
  summary: {
    eligiblePages: number
    returnedPages: number
    eligibleTemplates: number
    returnedTemplates: number
    eligibleQueries: number
    returnedQueries: number
    eligibleClicks: number
    eligibleImpressions: number
    returnedClicks: number
    returnedImpressions: number
    contentIssues: number
    technicalIssues: number
    fetchFailures: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  verification:
    | { requested: false; attempted: 0; verified: 0; failed: 0 }
    | {
        requested: true
        limit: number
        attempted: number
        verified: number
        failed: number
        technicalChecks: number
      }
  items: SecondPageItem[]
  caveats: string[]
  recommendations: string[]
  ledgerSummary: string
  warnings: Array<{
    stage: 'verification'
    url: string
    code: 'page-warning' | 'verification-failed'
    message: string
  }>
}
