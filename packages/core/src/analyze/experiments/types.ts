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
  clicks: number | null
  clickPct: number | null
  impressions: number | null
  impressionPct: number | null
  ctr: number | null
  position: number | null
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
  schemaVersion: 1
  methodology: 'equal-finalized-calendar-windows-v1'
  dataStatus: 'complete' | 'partial'
  change: SeoChange
  window: {
    requestedDays: number
    effectiveDays: number
    afterWindowTruncated: boolean
    gscTimezone: 'America/Los_Angeles'
    availableDateWindow: {
      earliestDate: string
      latestFinalDate: string
    }
  }
  source: {
    searchAnalytics: {
      status: 'complete' | 'partial'
      completeness: 'date-aggregates' | 'retained-query-date-aggregates'
      dimensions: ['date']
      searchType: 'web'
      dataState: 'final'
      before: {
        calls: number
        rowsFetched: number
        returnedRows: number
        invalidRows: number
        duplicateRows: number
      }
      after: {
        calls: number
        rowsFetched: number
        returnedRows: number
        invalidRows: number
        duplicateRows: number
      }
      control?: {
        status: 'complete' | 'partial'
        completeness: 'date-aggregates' | 'retained-query-date-aggregates'
        before: ChangeMeasurement['source']['searchAnalytics']['before']
        after: ChangeMeasurement['source']['searchAnalytics']['after']
      }
      warnings: string[]
    }
    analytics?: {
      status: 'complete' | 'partial'
      before: {
        rows: number
        rowCount: number
        timeZone?: string
        currencyCode?: string
      }
      after: {
        rows: number
        rowCount: number
        timeZone?: string
        currencyCode?: string
      }
      warnings: string[]
    }
  }
  before: { startDate: string; endDate: string; metrics: TestMetrics | null }
  after: { startDate: string; endDate: string; metrics: TestMetrics | null }
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
    before: {
      startDate: string
      endDate: string
      metrics: TestMetrics | null
    }
    after: { startDate: string; endDate: string; metrics: TestMetrics | null }
    delta: MetricDelta
    adjusted: {
      methodology: 'control-ratio-counterfactual-v1'
      clickDelta: number | null
      clickPctPoints: number | null
      impressionDelta: number | null
      impressionPctPoints: number | null
    }
    note: string
  }
  verdict: 'positive' | 'negative' | 'mixed' | 'flat' | 'not-enough-data'
  confidence: 'high' | 'medium' | 'low'
  note: string
  warnings: string[]
  caveats: string[]
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
