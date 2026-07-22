import type { MarketIndependentProviderEvidence } from '../providers/contracts.js'
import type {
  ExternalBacklinkPage,
  LinkSummary,
  ProviderLinkMetric,
} from '../providers/link-contracts.js'

export type LinkEvidenceProvider =
  | 'bing-webmaster'
  | 'dataforseo'
  | 'csv-import'
  | 'json-import'
  | 'jsonl-import'

export type LinkEvidenceRow = {
  sourceUrl: string
  sourceDomain: string
  targetUrl: string
  anchorText?: string
  firstSeenAt?: string
  lastSeenAt?: string
  nofollow?: boolean
  linkType?: string
  attributes?: string[]
  state?: 'live' | 'lost'
  indirect?: boolean
  linksFromPage?: number
  linksFromDomain?: number
  providerMetrics?: ProviderLinkMetric[]
}

export type LinkTargetCount = {
  targetUrl: string
  providerReportedLinks?: number
  observedLinks: number
}

export type LinkEvidenceProvenance = {
  provider: LinkEvidenceProvider
  observedAt: string
  cached: boolean
  suppliedRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  capped: boolean
  rowLimit: number
  completeness: 'complete' | 'partial' | 'unknown'
  file?: {
    path: string
    format: 'csv' | 'json' | 'jsonl'
    bytesRead: number
    fileBytes: number
  }
  providerRequests?: {
    methods: string[]
    targetPagesRequested?: number
    detailPagesRequested?: number
    maxConcurrentRequests?: number
  }
  providerCoverage?: {
    targetCountRows: {
      returnedRows: number
      retainedRows: number
      invalidRows: number
    }
    detailRows: {
      returnedRows: number
      retainedRows: number
      invalidRows: number
    }
    summaryRows?: {
      returnedRows: number
      retainedRows: number
      invalidRows: number
    }
    backlinkRows?: {
      returnedRows: number
      retainedRows: number
      invalidRows: number
      providerTotalRows: number | null
    }
  }
}

export type ExternalLinkProviderEvidence = {
  summary: MarketIndependentProviderEvidence<LinkSummary>
  backlinks: MarketIndependentProviderEvidence<ExternalBacklinkPage>
}

export type CollectedLinkEvidence = {
  rows: LinkEvidenceRow[]
  targetCounts: LinkTargetCount[]
  provenance: LinkEvidenceProvenance
  externalProvider?: ExternalLinkProviderEvidence
  warnings: string[]
}
