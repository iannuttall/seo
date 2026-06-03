import type { PageTemplate } from '../analyze/page-patterns.js'
import type {
  ExtractedPage,
  PageFetchDiagnostics,
  QueryContentCoverage,
} from './pages.js'

export interface Recommendation {
  principle: string
  evidenceRef: string
  action: string
  effort: 'S' | 'M' | 'L'
  confidence: 'high' | 'medium' | 'low'
  impactEstimate?: string
}

export interface AuditPageReport {
  url: string
  fetchedAt: string
  page: ExtractedPage
  fetchDiagnostics: PageFetchDiagnostics
  metrics?: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  issues: Array<{
    code: string
    title: string
    detail: string
    principle: string
    evidenceRef: string
    severity: 'low' | 'medium' | 'high'
  }>
  recommendations: Recommendation[]
  warnings: string[]
}

export interface SecondPageItem {
  url: string
  primaryQuery: string
  template: PageTemplate
  position: number
  impressions: number
  ctr: number
  coverage: {
    inTitleExact: boolean
    inMeta: boolean
    inH1: boolean
    inFirst100Words: boolean
    inSlug: boolean
    bodyCount: number
  }
  fetchDiagnostics?: PageFetchDiagnostics
  contentVerification?: QueryContentCoverage
  recommendations: Recommendation[]
}

export interface SecondPageReport {
  site: string
  range: number
  generatedAt: string
  verification:
    | { requested: false; verified: 0; failed: 0 }
    | { requested: true; limit: number; verified: number; failed: number }
  items: SecondPageItem[]
  ledgerSummary: string
  warnings: string[]
}

export interface QueryCluster {
  label: string
  intent:
    | 'informational'
    | 'commercial'
    | 'transactional'
    | 'navigational'
    | 'mixed'
  queries: Array<{
    query: string
    impressions: number
    clicks: number
    position: number
  }>
  totals?: {
    impressions: number
    clicks: number
    averagePosition: number
    ctr: number
  }
  opportunityScore?: number
  summary?: string
  recommendation?: string
}

export interface CacheStats {
  dbPath: string
  sizeBytes: number
  counts: Record<string, number>
}
