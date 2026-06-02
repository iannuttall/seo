export type ContentGroupDimension = 'page' | 'query'
export type ContentGroupMatchType = 'equals' | 'contains' | 'regex'

export type ContentGroup = {
  id: string
  site: string
  name: string
  dimension: ContentGroupDimension
  matchType: ContentGroupMatchType
  pattern: string
  createdAt: string
}

export type ChangeScope = 'site' | 'page' | 'query' | 'group'

export type SeoChange = {
  id: string
  site: string
  scope: ChangeScope
  target: string
  title: string
  description?: string
  changedAt: string
  createdAt: string
}

export type TestMetrics = {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type ChangeMeasurement = {
  change: SeoChange
  before: { startDate: string; endDate: string; metrics: TestMetrics }
  after: { startDate: string; endDate: string; metrics: TestMetrics }
  delta: {
    clicks: number
    clickPct: number | null
    impressions: number
    impressionPct: number | null
    ctr: number
    position: number
  }
  verdict: 'positive' | 'negative' | 'mixed' | 'flat' | 'not-enough-data'
  confidence: 'high' | 'medium' | 'low'
  note: string
}

export type ContentGroupRow = {
  id: string
  site_url: string
  name: string
  dimension: ContentGroupDimension
  match_type: ContentGroupMatchType
  pattern: string
  created_at: number
}

export type ChangeRow = {
  id: string
  site_url: string
  scope: ChangeScope
  target: string
  title: string
  description?: string | null
  changed_at: string
  created_at: number
}
