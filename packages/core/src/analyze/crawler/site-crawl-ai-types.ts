export type CrawlAiAvailability =
  | 'available'
  | 'absent'
  | 'access-blocked'
  | 'rate-limited'
  | 'unreachable'

export type CrawlAiBotAccess = {
  userAgent: string
  // search: fetches pages to answer a person's question or show them in AI
  // search. training: collects pages to train models. other: neither.
  purpose: 'search' | 'training' | 'other'
  allowed: boolean | null
  declared: boolean
  coveredByWildcard: boolean
}

export type CrawlAiResourceSignal = {
  url: string
  exists: boolean
  status?: number
  contentType?: string
  validJson?: boolean
}

export type CrawlAiLinkCheck = {
  url: string
  status?: number
  contentType?: string
  error?: string
}

export type CrawlAiSignals = {
  robotsTxt?: {
    url: string
    exists: boolean
    availability: CrawlAiAvailability
    status?: number
    error?: string
    sitemapUrls: string[]
    // Distinct robots.txt Content-Signal directive values. undefined means the
    // directives were not collected; [] means robots.txt declared none.
    contentSignals?: string[]
    botAccess: CrawlAiBotAccess[]
  }
  llmsTxt?: {
    url: string
    exists: boolean
    availability?: CrawlAiAvailability
    status?: number
    error?: string
    // Same-site links in llms.txt, checked up to the limit in file order.
    links?: {
      found: number
      checked: number
      limit: number
      broken: CrawlAiLinkCheck[]
    }
  }
  agentResources?: CrawlAiResourceSignal[]
  // The start URL requested with Accept: text/markdown.
  markdownNegotiation?: {
    url: string
    availability: CrawlAiAvailability
    status?: number
    contentType?: string
    markdown: boolean
    varyAccept: boolean
    error?: string
  }
  // Markdown copies that crawled pages link to. Public pages are indexable
  // HTML pages; every other page is private.
  markdownCopies?: {
    publicPages: number
    publicPagesWithLink: number
    privatePagesWithLink: number
    checked: number
    limit: number
    broken: Array<CrawlAiLinkCheck & { page: string; public: boolean }>
    largest?: { url: string; estimatedTokens: number }
  }
  // The start page's Link header relations and Content-Signal header.
  startPageHeaders?: {
    url: string
    linkRelations: string[]
    contentSignal?: string
  }
}
