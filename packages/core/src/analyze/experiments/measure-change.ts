import {
  querySearchAnalytics,
  type SearchAnalyticsRequest,
} from '../../gsc/client.js'
import type { GscRow } from '../../types.js'
import { getChange } from './change-log.js'
import { getContentGroup } from './content-groups.js'
import type {
  ChangeMeasurement,
  ChangeScope,
  ContentGroup,
  ContentGroupMatchType,
  SeoChange,
  TestMetrics,
} from './types.js'

function dateShift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function latestGscDate(): string {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 4)
  return end.toISOString().slice(0, 10)
}

function pct(after: number, before: number): number | null {
  if (before === 0) return after === 0 ? 0 : null
  return Number((((after - before) / before) * 100).toFixed(2))
}

function fixed(value: number, digits = 3): number {
  return Number(value.toFixed(digits))
}

function summarizeRows(rows: GscRow[]): TestMetrics {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const ctr = impressions > 0 ? clicks / impressions : 0
  const position =
    impressions > 0
      ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
        impressions
      : 0

  return {
    clicks: fixed(clicks),
    impressions: fixed(impressions),
    ctr: fixed(ctr, 4),
    position: fixed(position),
  }
}

function groupOperator(matchType: ContentGroupMatchType) {
  return matchType === 'regex'
    ? 'includingRegex'
    : matchType === 'contains'
      ? 'contains'
      : 'equals'
}

function filterForChange(
  change: SeoChange,
  group?: ContentGroup,
): SearchAnalyticsRequest['dimensionFilterGroups'] {
  if (change.scope === 'site') return undefined

  const dimension = change.scope === 'group' ? group?.dimension : change.scope
  const expression = change.scope === 'group' ? group?.pattern : change.target
  if (!dimension || !expression) return undefined

  const operator =
    change.scope === 'group' && group
      ? groupOperator(group.matchType)
      : 'equals'

  return [
    {
      groupType: 'and',
      filters: [{ dimension, operator, expression }],
    },
  ]
}

function classify(input: {
  before: TestMetrics
  after: TestMetrics
  clickPct: number | null
  clickDelta: number
  positionDelta: number
}): Pick<ChangeMeasurement, 'verdict' | 'confidence' | 'note'> {
  const totalImpressions = input.before.impressions + input.after.impressions
  if (totalImpressions < 100) {
    return {
      verdict: 'not-enough-data',
      confidence: 'low',
      note: 'The comparison windows have fewer than 100 impressions total.',
    }
  }

  const pctValue = input.clickPct ?? 0
  const betterPosition = input.positionDelta < -0.5
  const worsePosition = input.positionDelta > 0.5
  const positive = input.clickDelta > 0 && (pctValue >= 10 || betterPosition)
  const negative = input.clickDelta < 0 && (pctValue <= -10 || worsePosition)

  const confidence =
    Math.abs(input.clickDelta) >= 50 && Math.abs(pctValue) >= 30
      ? 'high'
      : Math.abs(input.clickDelta) >= 10 && Math.abs(pctValue) >= 10
        ? 'medium'
        : 'low'

  if (positive) {
    return {
      verdict: 'positive',
      confidence,
      note: 'Clicks improved after the change. Confirm with segment breakdown before rolling out widely.',
    }
  }
  if (negative) {
    return {
      verdict: 'negative',
      confidence,
      note: 'Clicks declined after the change. Check query mix, ranking movement, and indexability before reverting.',
    }
  }
  if (betterPosition || worsePosition) {
    return {
      verdict: 'mixed',
      confidence,
      note: 'Ranking movement and click movement disagree. Inspect SERP layout, CTR, and query demand.',
    }
  }
  return {
    verdict: 'flat',
    confidence,
    note: 'No material movement detected in this window.',
  }
}

async function queryMetrics(input: {
  site: string
  startDate: string
  endDate: string
  filters?: SearchAnalyticsRequest['dimensionFilterGroups']
  refresh?: boolean
}): Promise<TestMetrics> {
  const result = await querySearchAnalytics(
    input.site,
    {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ['date'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: input.filters,
    },
    { refresh: input.refresh },
  )
  return summarizeRows(result.rows)
}

export async function measureChange(input: {
  id?: string
  site?: string
  scope?: ChangeScope
  target?: string
  title?: string
  changedAt?: string
  beforeDays?: number
  afterDays?: number
  refresh?: boolean
}): Promise<ChangeMeasurement> {
  const stored = input.id ? getChange(input.id) : undefined
  const change =
    stored ??
    ({
      id: 'adhoc',
      site: input.site,
      scope: input.scope,
      target: input.target,
      title: input.title ?? 'Ad hoc change measurement',
      changedAt: input.changedAt,
      createdAt: new Date().toISOString(),
    } as SeoChange)

  if (!change.site || !change.scope || !change.target || !change.changedAt) {
    throw new Error(
      'Pass a change id, or provide site, scope, target, and changedAt.',
    )
  }

  const beforeDays = input.beforeDays ?? 28
  const afterDays = input.afterDays ?? beforeDays
  const before = {
    startDate: dateShift(change.changedAt, -beforeDays),
    endDate: dateShift(change.changedAt, -1),
  }
  const desiredAfterEnd = dateShift(change.changedAt, afterDays - 1)
  const after = {
    startDate: change.changedAt,
    endDate:
      desiredAfterEnd > latestGscDate() ? latestGscDate() : desiredAfterEnd,
  }

  const group =
    change.scope === 'group' ? getContentGroup(change.target) : undefined
  if (change.scope === 'group' && !group) {
    throw new Error(`Content group ${change.target} was not found.`)
  }

  const filters = filterForChange(change, group)
  const [beforeMetrics, afterMetrics] = await Promise.all([
    queryMetrics({
      site: change.site,
      ...before,
      filters,
      refresh: input.refresh,
    }),
    queryMetrics({
      site: change.site,
      ...after,
      filters,
      refresh: input.refresh,
    }),
  ])

  const clickDelta = fixed(afterMetrics.clicks - beforeMetrics.clicks)
  const impressionDelta = fixed(
    afterMetrics.impressions - beforeMetrics.impressions,
  )
  const positionDelta = fixed(afterMetrics.position - beforeMetrics.position)
  const clickPct = pct(afterMetrics.clicks, beforeMetrics.clicks)
  const verdict = classify({
    before: beforeMetrics,
    after: afterMetrics,
    clickPct,
    clickDelta,
    positionDelta,
  })

  return {
    change,
    before: { ...before, metrics: beforeMetrics },
    after: { ...after, metrics: afterMetrics },
    delta: {
      clicks: clickDelta,
      clickPct,
      impressions: impressionDelta,
      impressionPct: pct(afterMetrics.impressions, beforeMetrics.impressions),
      ctr: fixed(afterMetrics.ctr - beforeMetrics.ctr, 4),
      position: positionDelta,
    },
    ...verdict,
  }
}
