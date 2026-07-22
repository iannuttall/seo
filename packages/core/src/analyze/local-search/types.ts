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

export type LocalAnalyticsLocation = {
  country: string | null
  region: string | null
  city: string | null
  sessions: number
  landingPages: number
  retainedSessionShare: number
}

export type LocalAnalyticsTemplate = {
  signature: string
  sessions: number
  landingPages: number
  locations: LocalAnalyticsLocation[]
  locationCoverage: {
    available: number
    returned: number
    omitted: number
  }
}

export type LocalAnalyticsEvidence = {
  requested: boolean
  status:
    | 'not-requested'
    | 'skipped'
    | 'complete'
    | 'partial'
    | 'empty'
    | 'filtered'
    | 'unavailable'
  source: {
    provider: 'google-analytics'
    propertyId: string | null
    dimensions: ['landingPagePlusQueryString', 'country', 'region', 'city']
    metrics: ['sessions']
    returnedRows: number
    availableRows: number | null
    retainedRows: number
    matchedRows: number
    matchedPages: number
    unmatchedRows: number
    invalidRows: number
    exactDuplicateRows: number
    limit: number
    limitReached: boolean
    completeness: 'not-requested' | 'complete' | 'partial' | 'unavailable'
    qualityWarnings: string[]
  }
  locations: LocalAnalyticsLocation[]
  locationCoverage: {
    available: number
    returned: number
    omitted: number
  }
  templates: LocalAnalyticsTemplate[]
  reason?: string
}

export type LocalSerpQueryObservation = {
  query: string
  evidenceRef: string
  checkedAt: string
  effectiveKeyword: string
  localPackPresent: boolean
  localPackListings: number
  organicResults: number
  organicCompetitors: number
  selfBestAbsoluteRank: number | null
}

export type LocalOrganicCompetitor = {
  domain: string
  relationship: 'search-competitor'
  siteType: 'unknown'
  classificationSource: 'unclassified'
  appearances: number
  matchedQueries: number
  queryCoverage: number
  bestAbsoluteRank: number
  sampleQueries: string[]
  sampleUrls: string[]
  evidenceRefs: string[]
}

export type LocalPackListing = {
  identifier: {
    type: 'google-cid' | 'url' | 'title-phone'
    value: string
  }
  title: string
  cid: string | null
  domain: string | null
  url: string | null
  phone: string | null
  appearances: number
  matchedQueries: number
  queryCoverage: number
  bestAbsoluteRank: number
  sampleQueries: string[]
  ratingObservations: Array<{
    query: string
    checkedAt: string
    type: string | null
    value: number | null
    votesCount: number | null
    maximum: number | null
  }>
  evidenceRefs: string[]
}

export type LocalSerpInsights = {
  methodology: 'local-serp-insights-v1'
  queryObservations: LocalSerpQueryObservation[]
  organicCompetitors: {
    available: number
    returned: number
    omitted: number
    limit: number
    items: LocalOrganicCompetitor[]
  }
  localPackListings: {
    available: number
    returned: number
    omitted: number
    limit: number
    items: LocalPackListing[]
  }
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
    analyticsJoinMethod: 'landing-page-path-geography-v1'
    serpInsightMethod: LocalSerpInsights['methodology']
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
    localPackListings: number
    organicCompetitors: number
    analyticsLocations: number
    analyticsMatchedPages: number
    verdict: string
  }
  opportunities: LocalSearchOpportunity[]
  templates: LocalSearchTemplate[]
  serpEvidence: LocalSerpEvidence
  serpInsights: LocalSerpInsights
  analyticsEvidence: LocalAnalyticsEvidence
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
  googleAnalyticsPropertyId?: string
  analyticsLimit?: number
  refresh?: boolean
}
