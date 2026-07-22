import type {
  ProviderCostEvidence,
  ProviderId,
  SearchMarket,
} from '../../providers/contracts.js'
import type { SerpResultsReport } from '../serp-results.js'

export type LocalIntentClass = 'named-location' | 'nearby' | 'postal-code'

export type LocalIntentEvidence = {
  heuristic: true
  method: 'explicit-local-intent-v1'
  classes: LocalIntentClass[]
  matchedTerms: string[]
}

export type LocalSearchPageEvidence = {
  url: string
  clicks: number
  impressions: number
  ctr: number
  averagePosition: number
}

export type LocalSearchOpportunity = {
  query: string
  clicks: number
  impressions: number
  ctr: number
  averagePosition: number
  intent: LocalIntentEvidence
  action:
    | 'protect-visibility'
    | 'improve-existing-page'
    | 'investigate-relevance'
    | 'review-page-overlap'
  pages: LocalSearchPageEvidence[]
  pageCoverage: {
    available: number
    returned: number
    omitted: number
  }
}

export type LocalSearchTemplate = {
  heuristic: true
  signature: string
  urlCount: number
  sampleUrls: string[]
  queryCount: number
  clicks: number
  impressions: number
}

export type LocalSerpEvidence = {
  requested: boolean
  status: 'not-requested' | 'skipped' | 'complete' | 'partial' | 'unavailable'
  selection: {
    availableQueries: number
    requestedQueries: number
    omittedQueries: number
    limit: number
    depth: number
    method: 'highest-impression-local-queries-v1'
  }
  market: SearchMarket | null
  reports: SerpResultsReport[]
  cost: ProviderCostEvidence
  reason?: string
  error?: {
    code: 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED'
    message: string
    retryable: boolean
  }
}

export type LocalSearchReport = {
  schemaVersion: 1
  methodology: 'local-search-demand-v1'
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  rangeDays: number
  dataStatus: 'complete' | 'partial' | 'empty' | 'filtered'
  source: {
    provider: 'google-search-console'
    dimensions: ['query', 'page']
    searchType: 'web'
    dataState: 'final'
    rowsFetched: number
    calls: number
    maxRows: number
    possiblyTruncated: boolean
    completeness: 'retained-query-page-rows-only' | 'possibly-truncated'
  }
  methodologyDetails: {
    intentMethod: LocalIntentEvidence['method']
    suppliedLocationTerms: string[]
    automaticPatterns: [
      'nearby-phrases',
      'uk-postcodes',
      'contextual-us-zip-codes',
    ]
    opportunityOrder: 'impressions-clicks-position-query-v1'
    templateMethod: 'pseo-url-template-clustering-v1'
  }
  selection: {
    sourceRows: number
    invalidRows: number
    exactDuplicateRows: number
    conflictingRows: number
    lowActionabilityRows: number
    brandRows: number
    nonLocalRows: number
    belowMinimumRows: number
    eligibleQueries: number
    returnedQueries: number
    omittedQueries: number
    limit: number
    minImpressions: number
  }
  summary: {
    localQueries: number
    returnedQueries: number
    pages: number
    clicks: number
    impressions: number
    namedLocationQueries: number
    nearbyQueries: number
    postalCodeQueries: number
    pageOverlapQueries: number
    templates: number
    serpSnapshots: number
    localPackSnapshots: number
    verdict: string
  }
  opportunities: LocalSearchOpportunity[]
  templates: LocalSearchTemplate[]
  serpEvidence: LocalSerpEvidence
  warnings: string[]
  caveats: string[]
  nextSteps: string[]
}

export type LocalSearchInput = {
  site: string
  days?: number
  locationTerms?: string[]
  minImpressions?: number
  limit?: number
  maxRows?: number
  brandTerms?: string[]
  includeBrand?: boolean
  includeSerps?: boolean
  market?: SearchMarket
  provider?: ProviderId
  projectId?: string
  serpLimit?: number
  serpDepth?: number
  refresh?: boolean
}
