import type {
  ProviderImportEvidence,
  ProviderWarning,
} from '../../providers/contracts.js'
import type { ResearchImportSource } from '../../providers/domain-contracts.js'
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
  // Optional only so pre-existing fixtures stay valid; cannibalReport always
  // sets it.
  dataSource?: 'search-console-api'
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
      validation: {
        retainedRows: number
        invalidRows: number
      }
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    propertyDemand: {
      dimensions: ['query']
      aggregationType: 'byProperty'
      rowsFetched: number
      validation: {
        retainedRows: number
        invalidRows: number
      }
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    completeness:
      | 'unavailable'
      | 'complete'
      | 'partial'
      | 'possibly-truncated'
      | 'partial-and-possibly-truncated'
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

export interface CannibalImportPage {
  url: string
  providerBestPosition: number
  providerEstimatedMonthlyTraffic: number | null
  resultTypes: string[]
  clicks: null
  impressions: null
  ctr: null
  template: PageTemplate
}

export interface CannibalImportItem {
  keyword: string
  pages: CannibalImportPage[]
  urlCount: number
  providerMonthlySearchVolume: number | null
  finding: 'multiple-ranking-urls'
  requiresIntentReview: true
  template?: PageTemplate
  recommendation: Recommendation
}

export interface CannibalImportSelection {
  importedRows: number
  offPropertyRows: number
  retainedRows: number
  keywordGroups: number
  lowActionabilityKeywords: number
  brandKeywords: number
  singleUrlKeywords: number
  suppressedKeywords: number
  eligibleKeywords: number
  returnedKeywords: number
  limitedKeywords: number
  returnedSuppressions: number
  limitedSuppressions: number
}

export interface CannibalImportReport {
  schemaVersion: 1
  dataSource: 'research-import'
  site: string
  siteDomain: string
  generatedAt: string
  dataStatus: 'empty' | 'filtered' | 'partial'
  source: {
    provider: ResearchImportSource['provider']
    evidenceType: 'ranked-keyword-import'
    files: number
    completeness: 'unknown' | 'partial' | 'capped' | 'filtered'
  }
  methodology: {
    id: 'import_url_overlap_v1'
    version: 1
    matching: 'normalized_exact_keyword'
    finding: 'multiple-ranking-urls'
    requiresIntentReview: true
  }
  filters: {
    limit: number
    brand: 'included' | 'excluded'
  }
  selection: CannibalImportSelection
  summary: {
    eligibleKeywords: number
    returnedKeywords: number
    suppressedKeywords: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  templates: TemplateSummary[]
  suppressed: CannibalSuppression[]
  suppressionSummary: Record<string, number>
  items: CannibalImportItem[]
  evidence: {
    imports: ProviderImportEvidence[]
    warnings: ProviderWarning[]
  }
  caveats: string[]
  recommendations: string[]
}

export interface AnalyzeCannibalImportRowsInput {
  site: string
  provider: ResearchImportSource['provider']
  rows: import('../../providers/imports/research-rows.js').ImportedResearchRow[]
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}

export interface CannibalImportAnalysis {
  filters: CannibalImportReport['filters']
  selection: Omit<CannibalImportSelection, 'importedRows' | 'offPropertyRows'>
  items: CannibalImportItem[]
  suppressed: CannibalSuppression[]
  suppressionSummary: Record<string, number>
  templates: TemplateSummary[]
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
