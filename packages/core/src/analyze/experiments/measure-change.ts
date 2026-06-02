import {
  querySearchAnalytics,
  type SearchAnalyticsRequest,
} from '../../gsc/client.js'
import { getChange } from './change-log.js'
import { getContentGroup } from './content-groups.js'
import { classify } from './measurement/classify.js'
import { dateShift, latestGscDate } from './measurement/dates.js'
import { filterForChange } from './measurement/filters.js'
import { fixed, pct, summarizeRows } from './measurement/math.js'
import type {
  ChangeMeasurement,
  ChangeScope,
  SeoChange,
  TestMetrics,
} from './types.js'

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
