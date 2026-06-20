import type { Ga4ReportRequest } from '../../../ga4/client.js'
import type {
  AnalyticsMetricDelta,
  AnalyticsTestMetrics,
  ContentGroup,
  SeoChange,
} from '../types.js'
import { fixed, pct } from './math.js'

function pathFromTarget(value: string): string {
  try {
    const url = new URL(value)
    return `${url.pathname}${url.search}`
  } catch {
    return value
  }
}

function stringMatchType(matchType?: ContentGroup['matchType']) {
  if (matchType === 'regex') return 'PARTIAL_REGEXP'
  if (matchType === 'equals') return 'EXACT'
  return 'CONTAINS'
}

export function ga4LandingPageFilterForChange(
  change: SeoChange,
  group?: ContentGroup,
): Ga4ReportRequest['dimensionFilter'] | undefined {
  if (change.scope === 'site') return undefined
  if (change.scope === 'query') return undefined

  if (change.scope === 'group') {
    if (group?.dimension !== 'page') return undefined
    return {
      filter: {
        fieldName: 'landingPagePlusQueryString',
        stringFilter: {
          matchType: stringMatchType(group.matchType),
          value: pathFromTarget(group.pattern),
          caseSensitive: false,
        },
      },
    }
  }

  return {
    filter: {
      fieldName: 'landingPagePlusQueryString',
      stringFilter: {
        matchType: 'EXACT',
        value: pathFromTarget(change.target),
        caseSensitive: false,
      },
    },
  }
}

export function summarizeGa4Rows(
  rows: Array<Record<string, string>>,
): AnalyticsTestMetrics {
  return rows.reduce(
    (sum, row) => ({
      sessions: fixed(sum.sessions + (Number(row.sessions) || 0)),
      engagedSessions: fixed(
        sum.engagedSessions + (Number(row.engagedSessions) || 0),
      ),
      conversions: fixed(sum.conversions + (Number(row.conversions) || 0)),
      totalRevenue: fixed(sum.totalRevenue + (Number(row.totalRevenue) || 0)),
    }),
    {
      sessions: 0,
      engagedSessions: 0,
      conversions: 0,
      totalRevenue: 0,
    },
  )
}

export function analyticsDelta(input: {
  before: AnalyticsTestMetrics
  after: AnalyticsTestMetrics
}): AnalyticsMetricDelta {
  return {
    sessions: fixed(input.after.sessions - input.before.sessions),
    sessionPct: pct(input.after.sessions, input.before.sessions),
    engagedSessions: fixed(
      input.after.engagedSessions - input.before.engagedSessions,
    ),
    engagedSessionPct: pct(
      input.after.engagedSessions,
      input.before.engagedSessions,
    ),
    conversions: fixed(input.after.conversions - input.before.conversions),
    conversionPct: pct(input.after.conversions, input.before.conversions),
    totalRevenue: fixed(input.after.totalRevenue - input.before.totalRevenue),
    revenuePct: pct(input.after.totalRevenue, input.before.totalRevenue),
  }
}
