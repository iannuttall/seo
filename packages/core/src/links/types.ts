export type LinkEvidenceProvider =
  | 'bing-webmaster'
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
}

export type LinkTargetCount = {
  targetUrl: string
  providerReportedLinks?: number
  observedLinks: number
}

export type LinkEvidenceProvenance = {
  provider: LinkEvidenceProvider
  observedAt: string
  cached: false
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
    targetPagesRequested: number
    detailPagesRequested: number
    maxConcurrentRequests: number
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
  }
}

export type CollectedLinkEvidence = {
  rows: LinkEvidenceRow[]
  targetCounts: LinkTargetCount[]
  provenance: LinkEvidenceProvenance
  warnings: string[]
}
