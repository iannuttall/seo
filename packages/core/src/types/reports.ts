import type { RuleId } from '../rules.js'
import type { ExtractedPage, PageFetchDiagnostics } from './pages.js'

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
    code: RuleId
    title: string
    detail: string
    principle: string
    evidenceRef: string
    severity: 'low' | 'medium' | 'high'
  }>
  recommendations: Recommendation[]
  warnings: string[]
}

export type {
  SecondPageItem,
  SecondPageReport,
} from '../analyze/second-page-analysis-types.js'

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
  topPages?: Array<{
    url: string
    impressions: number
    clicks: number
  }>
  template?: {
    signature: string
    urlCount: number
    share: number
    sampleUrls: string[]
  }
  totals?: {
    impressions: number
    clicks: number
    averagePosition: number
    ctr: number
  }
  benchmark?: {
    expectedCtr: number
    source: string
    peerRows: number
    peerImpressions: number
    qualifiedPeerImpressions: number
    urlSamples: number
    positiveUrlSamples: number
  }
  estimatedClickLift?: number
  opportunityScore?: number
  summary?: string
  recommendation?: string
}

export interface CacheStats {
  dbPath: string
  sizeBytes: number
  counts: Record<string, number>
}
