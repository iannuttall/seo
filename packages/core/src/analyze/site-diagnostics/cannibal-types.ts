import type { Recommendation } from '../../types.js'
import type { PageTemplate, TemplateSummary } from '../page-patterns.js'

export type CannibalSuppressionReason = 'brand_query'

export interface CannibalSuppression {
  query: string
  reason: CannibalSuppressionReason
  urlCount: number
  template?: PageTemplate
  evidenceRef: string
}

export interface CannibalPage {
  url: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  impressionShare: number
  template: PageTemplate
}

export interface CannibalItem {
  query: string
  pages: CannibalPage[]
  pageCount: number
  materialPageClicks: number
  materialPageExposureImpressions: number
  pageExposureImpressions: number
  propertyImpressions?: number
  observedPageExposureRatio?: number
  additionalUrlExposures?: number
  hhi: number
  splitScore: number
  largestPageShare: number
  secondaryExposureShare: number
  reviewContext: Array<
    'quoted-query' | 'local-or-entity-intent' | 'same-template-family'
  >
  suggestedOwnerUrl: string
  ownerSelection: {
    method: 'clicks_then_impressions_then_position'
    confidence: 'low'
    requiresIntentReview: true
  }
  priority: {
    method: 'demand_impressions_x_secondary_exposure'
    score: number
    demandImpressions: number
    secondaryExposureShare: number
    heuristic: true
    estimatedClickLift: false
  }
  template?: PageTemplate
  recommendation: Recommendation
}

export interface CannibalSelection {
  sourceRows: number
  invalidRows: number
  validRows: number
  propertySourceRows: number
  propertyInvalidRows: number
  propertyQueryGroups: number
  queryGroups: number
  lowActionabilityQueries: number
  brandQueries: number
  belowMinimumQueries: number
  singlePageQueries: number
  incidentalPages: number
  dominantQueries: number
  missingPropertyQueries: number
  suppressedQueries: number
  eligibleClusters: number
  returnedClusters: number
  limitedClusters: number
  returnedSuppressions: number
  limitedSuppressions: number
}

export interface CannibalReport {
  schemaVersion: 1
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  rangeDays: number
  dataStatus: 'unavailable' | 'empty' | 'filtered' | 'partial' | 'complete'
  source: {
    provider: 'google-search-console'
    searchType: 'web'
    dataState: 'final'
    pageExposure: {
      dimensions: ['query', 'page']
      aggregationType: 'auto'
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    propertyDemand: {
      dimensions: ['query']
      aggregationType: 'byProperty'
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    completeness: 'unavailable' | 'complete' | 'possibly-truncated'
  }
  methodology: {
    id: 'gsc_url_overlap_v2'
    version: 2
    minimumPageImpressions: number
    minimumPageImpressionShare: number
    maximumDominantPageShare: number
    matching: 'normalized_exact_query'
    finding: 'url-overlap-candidate'
    requiresIntentReview: true
  }
  verification: {
    status: 'not-requested'
    technicalStateChecked: false
    searchIntentChecked: false
  }
  filters: {
    minImpressions: number
    limit: number
    brand: 'included' | 'excluded'
  }
  selection: CannibalSelection
  summary: {
    eligibleClusters: number
    returnedClusters: number
    suppressedQueries: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  templates: TemplateSummary[]
  suppressed: CannibalSuppression[]
  suppressionSummary: Record<string, number>
  items: CannibalItem[]
  caveats: string[]
  recommendations: string[]
  ledgerSummary: string
}

export interface AnalyzeCannibalRowsInput {
  site: string
  rows: import('../../types.js').GscRow[]
  propertyRows?: import('../../types.js').GscRow[]
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}

export interface CannibalAnalysis {
  filters: CannibalReport['filters']
  selection: CannibalSelection
  items: CannibalItem[]
  suppressed: CannibalSuppression[]
  suppressionSummary: Record<string, number>
  templates: TemplateSummary[]
}
