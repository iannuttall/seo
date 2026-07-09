import type {
  CoverageField,
  ExtractedPage,
  GscRow,
  PageFetchDiagnostics,
} from '../types.js'

export type PageOpportunityType =
  | 'ctr'
  | 'ranking'
  | 'content-gap'
  | 'serp-framing'
  | 'covered'
  | 'technical-check'
  | 'unverified'

export type PageOpportunityBenchmark = {
  applicable: boolean
  expectedCtr?: number
  source: string
  peerRows: number
  peerImpressions: number
  qualifiedPeerImpressions: number
  urlSamples: number
  positiveUrlSamples: number
  excludedTargetRows: number
}

export type PageOpportunityVerification = {
  status: 'verified' | 'technical-check' | 'unverified'
  reason: string
  signals: string[]
  httpStatus?: number
  fields?: {
    title: CoverageField
    metaDescription: CoverageField
    h1: CoverageField
    mainContent: CoverageField
  }
}

export type PageOpportunityItem = {
  query: string
  url: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  expectedCtr?: number
  expectedClicks?: number
  estimatedCtrClickShortfall?: number
  /** @deprecated Use estimatedCtrClickShortfall. */
  estimatedClickLift?: number
  opportunityType: PageOpportunityType
  benchmark: PageOpportunityBenchmark
  verification: PageOpportunityVerification
  recommendation: string
}

export type PageOpportunitySelection = {
  sourceRows: number
  invalidRows: number
  wrongPageRows: number
  belowMinimumRows: number
  lowActionabilityRows: number
  brandRows: number
  eligibleRows: number
  returnedRows: number
  limitedRows: number
}

export type PageOpportunityAnalysis = {
  site: string
  url: string
  minImpressions: number
  limit: number
  httpStatus?: number
  dataStatus: 'empty' | 'filtered' | 'available'
  sourceRows: number
  eligibleRows: number
  returnedRows: number
  benchmarkSourceRows: number
  benchmarkEligibleRows: number
  excludedTargetBenchmarkRows: number
  selection: PageOpportunitySelection
  items: PageOpportunityItem[]
  summary: {
    clicks: number
    impressions: number
    opportunities: number
    estimatedCtrClickShortfall: number
    /** @deprecated Use estimatedCtrClickShortfall. */
    estimatedClickLift: number
  }
}

export type PageOpportunityAnalysisInput = {
  targetRows: GscRow[]
  benchmarkRows: GscRow[]
  site: string
  url: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  page?: ExtractedPage
  fetchDiagnostics?: PageFetchDiagnostics
  httpStatus?: number
}
