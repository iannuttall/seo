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

export type AnalyticsTestMetrics = {
  sessions: number
  engagedSessions: number
  conversions: number
  totalRevenue: number
}

export type MetricDelta = {
  clicks: number
  clickPct: number | null
  impressions: number
  impressionPct: number | null
  ctr: number
  position: number
}

export type AnalyticsMetricDelta = {
  sessions: number
  sessionPct: number | null
  engagedSessions: number
  engagedSessionPct: number | null
  conversions: number
  conversionPct: number | null
  totalRevenue: number
  revenuePct: number | null
}

export type ChangeMeasurement = {
  change: SeoChange
  before: { startDate: string; endDate: string; metrics: TestMetrics }
  after: { startDate: string; endDate: string; metrics: TestMetrics }
  delta: MetricDelta
  analytics?: {
    propertyId: string
    before: {
      startDate: string
      endDate: string
      metrics: AnalyticsTestMetrics
    }
    after: {
      startDate: string
      endDate: string
      metrics: AnalyticsTestMetrics
    }
    delta: AnalyticsMetricDelta
    note: string
  }
  control?: {
    change: SeoChange
    before: { startDate: string; endDate: string; metrics: TestMetrics }
    after: { startDate: string; endDate: string; metrics: TestMetrics }
    delta: MetricDelta
    adjusted: {
      clickDelta: number
      clickPctPoints: number | null
      impressionDelta: number
      impressionPctPoints: number | null
    }
    note: string
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
