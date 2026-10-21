import type {
  HeldBackReason,
  LinkRole,
  PageType,
  SearchIntent,
} from './internal-links-judge.js'

export interface InternalLinkSuggestion {
  source: string
  target: string
  // strong and possible come from the decision model's probability;
  // heuristic means no model judged this link.
  tier: 'strong' | 'possible' | 'heuristic'
  probability: number | null
  role: LinkRole | null
  // A real phrase from the sentence, or null when none reads as a link.
  anchor: string | null
  // A real sentence from the source, or null when the link needs new text.
  sentence: string | null
  section: string | null
  // Share of the target's naming words in the sentence, 0 to 1.
  sentenceMatch: number | null
  // TF-IDF similarity of the two pages, raised for targets with few links
  // and lowered for news. A heuristic.
  similarity: number
  // Search Console queries both pages appeared for, when it was used.
  sharedQueries: number
  targetInboundLinks: number
  sourceType: PageType | null
  targetType: PageType | null
}

export interface InternalLinksPage {
  url: string
  title: string
  type: PageType | null
  intent: SearchIntent | null
  words: number
  // Pages linking from their main content, and from anywhere on the page.
  inboundLinks: number
  inboundLinksAnywhere: number
  outboundLinks: number
  suggestedInbound: number
  suggestedOutbound: number
  noindex: boolean
}

export interface InternalLinksReport {
  site: string
  mode: 'site' | 'url'
  targetUrl: string | null
  generatedAt: string
  dataStatus:
    | 'complete'
    | 'partial'
    | 'blocked'
    | 'empty'
    | 'target-not-crawled'
    | 'target-not-linkable'
  crawl: {
    startUrl: string
    method: 'sitemap' | 'links'
    maxPages: number
    pageLimit: number
    urlsFound: number
    pagesCrawled: number
    capReached: boolean
    crawlDelaySeconds: number | null
    skipped: Record<string, number>
    redirectsChecked: number
  }
  searchConsole: {
    status: 'used' | 'not-available' | 'failed'
    property: string | null
    range: { startDate: string; endDate: string } | null
    rows: number
    possiblyTruncated: boolean
    pairsWithSharedQueries: number
    note: string | null
  }
  judge: {
    status: 'used' | 'partial' | 'not-used' | 'failed'
    note: string
    keySource: 'environment' | 'account' | null
    provider: string | null
    model: string | null
    requests: number
    failedRequests: number
    inputTokens: number
    costUsd: number
    pagesClassified: number
    pairsJudged: number
    thresholds: { possible: number; strong: number }
    floors: { minSentenceMatch: number; minSimilarityAlone: number }
  }
  target: {
    url: string
    title: string
    type: PageType | null
    intent: SearchIntent | null
    inboundLinks: number
    inboundLinksAnywhere: number
    noindex: boolean
  } | null
  summary: {
    verdict: string
    pagesCrawled: number
    existingContextualLinks: number
    orphanPages: number
    weaklyLinkedPages: number
    pairsConsidered: number
    suggestions: number
    strong: number
    possible: number
    heuristic: number
    heldBack: number
    declined: number
  }
  items: InternalLinkSuggestion[]
  heldBack: {
    count: number
    reasons: Partial<Record<HeldBackReason, number>>
    examples: Array<{
      source: string
      target: string
      reason: HeldBackReason
      detail: string
    }>
  }
  pageInventory: InternalLinksPage[]
  redirectedLinks: Array<{ source: string; via: string; target: string }>
  genericAnchors: Array<{ source: string; href: string; text: string }>
  warnings: string[]
  caveats: string[]
  next: string | null
}
