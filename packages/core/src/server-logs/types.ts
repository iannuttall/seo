export type ServerLogFormat = 'combined' | 'jsonl'

export type CrawlerCategory = 'search' | 'ai'

export type ServerLogRecord = {
  timestamp: string
  method: string
  path: string
  status: number
  bytes?: number
  userAgent?: string
  crawler?: {
    family: string
    category: CrawlerCategory
  }
}

export type StatusBreakdown = {
  success: number
  redirect: number
  clientError: number
  serverError: number
  other: number
}

export type CrawlerSummary = StatusBreakdown & {
  family: string
  category: CrawlerCategory
  requests: number
  lastSeenAt: string
}

export type CrawlerPathSummary = StatusBreakdown & {
  family: string
  category: CrawlerCategory
  path: string
  requests: number
  lastSeenAt: string
}

export type ServerLogEvidence = {
  summary: {
    suppliedRows: number
    parsedRows: number
    invalidRows: number
    crawlerRows: number
    nonCrawlerRows: number
    responseBytes: number
    firstSeenAt?: string
    lastSeenAt?: string
  }
  statusCodes: Array<{ status: number; requests: number }>
  crawlers: CrawlerSummary[]
  crawlerPaths: CrawlerPathSummary[]
  provenance: {
    source: 'local-server-log'
    observedAt: string
    cached: false
    file: {
      path: string
      format: ServerLogFormat
      bytesRead: number
      fileBytes: number
    }
    limits: {
      rowLimit: number
      pathLimit: number
      byteLimit: number
      maxLineBytes: number
    }
    coverage: {
      fileReadCompletely: boolean
      rowsCapped: boolean
      bytesCapped: boolean
      pathsCapped: boolean
      untrackedCrawlerPathRows: number
    }
    completeness: 'complete' | 'partial'
  }
  warnings: string[]
}
