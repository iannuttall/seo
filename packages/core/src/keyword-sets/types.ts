import type {
  KeywordMetric,
  ProviderId,
  SearchMarket,
} from '../providers/contracts.js'

export type KeywordSetPageMapping = {
  kind: 'target' | 'proposed'
  url: string
}

export type SavedKeywordMetric = {
  schemaVersion: 1
  provider: ProviderId
  observedAt: string
  metric: KeywordMetric
}

export type KeywordSet = {
  schemaVersion: 1
  id: string
  projectId: string
  name: string
  market: SearchMarket
  provider: ProviderId | null
  sourceReport: string | null
  keywordCount: number
  tagCount: number
  createdAt: string
  updatedAt: string
  lastRefreshedAt: string | null
}

export type KeywordSetItem = {
  keyword: string
  normalizedKeyword: string
  tags: string[]
  page: KeywordSetPageMapping | null
  latestMetric: SavedKeywordMetric | null
  createdAt: string
  updatedAt: string
}

export type KeywordSetDetail = {
  schemaVersion: 1
  set: KeywordSet
  items: KeywordSetItem[]
  pagination: {
    offset: number
    limit: number
    returned: number
    total: number
    nextOffset: number | null
  }
  filter: { tag: string | null }
}

export type KeywordSetMutationItem = {
  keyword: string
  tags?: string[]
  page?: KeywordSetPageMapping | null
  latestMetric?: SavedKeywordMetric | null
}

export type KeywordSetMutationResult = {
  setId: string
  requested: number
  normalized: number
  added: number
  removed: number
  existing: number
  updated: number
  keywordCount: number
}
