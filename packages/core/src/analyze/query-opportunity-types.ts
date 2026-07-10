import type { querySearchAnalytics } from '../gsc/client.js'

export type QueryOpportunityInput = {
  site: string
  days?: number
  startDate?: string
  endDate?: string
  limit?: number
  minImpressions?: number
  maxRows?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}

export type QueryOpportunityRow = {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type QueryOpportunitySelection = {
  sourceRows: number
  invalidRows: number
  duplicateRows: number
  conflictingRows: number
  brandRows: number
  belowMinimumRows: number
  eligibleRows: number
}

export type QueryOpportunityEvidence = {
  site: string
  generatedAt: string
  rangeDays: number
  dateRange: { startDate: string; endDate: string }
  filters: { limit: number; minImpressions: number; maxRows: number }
  source: {
    provider: 'google-search-console'
    dimensions: ['query']
    searchType: 'web'
    dataState: 'final'
    aggregationType: 'auto'
    rowsFetched: number
    calls: number
    maxRows: number
    possiblyTruncated: boolean
    completeness: 'retained-query-rows-only' | 'possibly-truncated'
    availableDateWindow: {
      earliestDate: string
      latestFinalDate: string
      basis: 'rolling-16-month-retention-with-finalization-lag'
    }
  }
  selection: QueryOpportunitySelection
  rows: QueryOpportunityRow[]
  warnings: string[]
  caveats: string[]
}

export type QueryOpportunityDependencies = {
  searchAnalytics: typeof querySearchAnalytics
  now: () => Date
}

export type ResolvedQueryOpportunityInput = {
  days: number
  limit: number
  minImpressions: number
  maxRows: number
  range: { startDate: string; endDate: string }
  availableDateWindow: {
    earliestDate: string
    latestFinalDate: string
  }
}
