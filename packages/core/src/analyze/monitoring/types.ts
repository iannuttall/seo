export type CrawlPageSnapshot = {
  url: string
  finalUrl: string
  status: number
  title?: string
  metaDescription?: string
  canonical?: string
  metaRobots?: string
  xRobotsTag?: string
  h1?: string
  indexable: boolean
  wordCount: number
  contentHash: string
  outgoingInternalCount: number
}

export type CrawlRun = {
  id: string
  site: string
  startUrl: string
  createdAt: string
  limit: number
  urlCount: number
}

export type CrawlDiffItem = {
  url: string
  kind: 'added' | 'removed' | 'changed'
  changes: string[]
  before?: Partial<CrawlPageSnapshot>
  after?: Partial<CrawlPageSnapshot>
}

export type CrawlDiffReport = {
  run: CrawlRun
  previousRun?: CrawlRun
  summary: {
    crawled: number
    added: number
    removed: number
    changed: number
    newErrors: number
    indexabilityFlips: number
  }
  items: CrawlDiffItem[]
  warnings: string[]
}

export type IndexWatchItem = {
  url: string
  verdict?: string
  coverageState?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  googleCanonical?: string
  userCanonical?: string
  lastCrawlTime?: string
  previous?: {
    verdict?: string
    coverageState?: string
    indexingState?: string
    robotsTxtState?: string
  }
  changed: boolean
  alert: boolean
}

export type IndexWatchReport = {
  site: string
  generatedAt: string
  summary: {
    inspected: number
    changed: number
    alerts: number
  }
  items: IndexWatchItem[]
}

export type IndexMonitorPropertyRun = {
  property: string
  inventoryUrls: number
  selectedUrls: number
  inspected: number
  changed: number
  alerts: number
  sampleUrls: string[]
}

export type IndexMonitorReport = {
  site: string
  generatedAt: string
  summary: {
    inventoryUrls: number
    properties: number
    dailyCapacity: number
    selected: number
    inspected: number
    changed: number
    alerts: number
    skipped: number
  }
  properties: IndexMonitorPropertyRun[]
  items: IndexWatchItem[]
  warnings: string[]
}

export type CrawlRunRow = {
  id: string
  site_url: string
  start_url: string
  created_at: number
  limit_count: number
  url_count: number
}

export type CrawlPageRow = {
  run_id: string
  url: string
  final_url: string
  status: number
  title?: string | null
  meta_description?: string | null
  canonical?: string | null
  meta_robots?: string | null
  x_robots_tag?: string | null
  h1?: string | null
  indexable: number
  word_count: number
  content_hash: string
  outgoing_internal_count: number
}

export type IndexWatchRow = {
  verdict?: string | null
  coverage_state?: string | null
  indexing_state?: string | null
  robots_txt_state?: string | null
  inspected_at?: number | null
}

export type LatestCrawlSummaryRow = CrawlRunRow & {
  status_errors: number
  non_indexable: number
}
