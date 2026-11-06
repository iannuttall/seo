export type CrawlAiAvailability =
  | 'available'
  | 'absent'
  | 'access-blocked'
  | 'rate-limited'
  | 'unreachable'
  // robots.txt only: a 2xx answer that is a web page, such as a bot
  // challenge or the site's HTML shell, so its rules are unknown.
  | 'unreadable'

// Why a request got no response. A failed request is never a missing file.
export type CrawlFetchErrorKind =
  | 'dns'
  | 'tls'
  | 'timeout'
  | 'redirect-limit'
  | 'redirect-loop'
  | 'too-large'
  | 'aborted'
  | 'unknown'

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
    contentType?: string
    // The server answered with an HTML page, such as a site that serves its
    // home page for every path. That is not a robots.txt file.
    servesHtml?: boolean
    error?: string
    errorKind?: CrawlFetchErrorKind
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
    contentType?: string
    // The server answered with an HTML page, not a text file.
    servesHtml?: boolean
    error?: string
    errorKind?: CrawlFetchErrorKind
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
  // Markdown copies that crawled pages link to. A public page loads without
  // a sign-in, whether or not it is noindex.
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
