import type { Recommendation } from '../../types.js'
import type { PageTemplate, TemplateSummary } from '../page-patterns.js'

export type DecayDiagnosis =
  | 'lost_position'
  | 'lost_ctr'
  | 'lost_impressions'
  | 'lost_clicks'

export type DecayComparison = 'previous-period' | 'year-over-year'

export type DecaySignal =
  | 'position_decline'
  | 'ctr_decline'
  | 'impression_decline'
  | 'click_decline'

export interface DecayMetrics {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface DecayItem {
  query: string
  url: string
  template: PageTemplate
  clickLoss: number
  dropPct: number
  current: DecayMetrics
  previous: DecayMetrics
  diagnosis: DecayDiagnosis
  signals: DecaySignal[]
  evidenceScope: 'retained-query-page-row'
  recommendation: Recommendation
}

export interface DecayGroup {
  id: string
  label: string
  diagnosis: DecayDiagnosis
  template: PageTemplate
  count: number
  urlCount: number
  totalClickLoss: number
  totalPreviousClicks: number
  averageDropPct: number
  sampleQueries: string[]
  sampleUrls: string[]
  recommendation: string
}

export interface DecaySelection {
  currentSourceRows: number
  previousSourceRows: number
  currentInvalidRows: number
  previousInvalidRows: number
  currentAggregatedRows: number
  previousAggregatedRows: number
  lowEvidenceRows: number
  lowActionabilityRows: number
  brandRows: number
  currentRowNotRetained: number
  urlShiftRows: number
  belowClickLossRows: number
  belowDropRows: number
  eligibleRows: number
  returnedRows: number
  limitedRows: number
  eligibleGroups: number
  returnedGroups: number
  limitedGroups: number
}

export interface AnalyzeDecayInput {
  site: string
  currentRows: import('../../types.js').GscRow[]
  previousRows: import('../../types.js').GscRow[]
  minDropPct?: number
  minPreviousClicks?: number
  minClickLoss?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}

export interface DecayAnalysis {
  selection: DecaySelection
  totals: {
    eligibleObservedRetainedQueryClickLoss: number
    returnedObservedRetainedQueryClickLoss: number
  }
  items: DecayItem[]
  groups: DecayGroup[]
  templates: TemplateSummary[]
}

export interface DecayReport {
  schemaVersion: 1
  site: string
  generatedAt: string
  comparison: DecayComparison
  ranges: {
    current: { startDate: string; endDate: string }
    previous: { startDate: string; endDate: string }
  }
  rangeDays: number
  dataStatus: 'unavailable' | 'empty' | 'filtered' | 'partial' | 'complete'
  source: {
    provider: 'google-search-console'
    dimensions: ['query', 'page']
    aggregationType: 'auto'
    searchType: 'web'
    dataState: 'final'
    current: {
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    previous: {
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    completeness:
      | 'unavailable'
      | 'retained-query-rows-only'
      | 'possibly-truncated'
  }
  methodology: {
    id: 'gsc_retained_query_page_decay_v2'
    version: 2
    gscHistoryMonths: 16
    missingRowsTreatedAsZero: false
    urlShiftsExcluded: true
    causeLanguage: 'signals-not-attribution'
  }
  filters: {
    minDropPct: number
    minPreviousClicks: number
    minClickLoss: number
    limit: number
    brand: 'included' | 'excluded'
  }
  selection: DecaySelection
  summary: {
    eligibleRows: number
    returnedRows: number
    groups: number
    observedRetainedQueryClickLoss: number
    returnedObservedRetainedQueryClickLoss: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  caveats: string[]
  recommendations: string[]
  items: DecayItem[]
  groups: DecayGroup[]
  templates: TemplateSummary[]
  ledgerSummary: string
  warnings: string[]
}
