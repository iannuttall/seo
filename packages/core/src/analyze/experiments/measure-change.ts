import { ga4RowsToObjects, runGa4Report } from '../../ga4/client.js'
import {
  querySearchAnalytics,
  type SearchAnalyticsRequest,
} from '../../gsc/client.js'
import { getChange } from './change-log.js'
import { getContentGroup } from './content-groups.js'
import {
  analyticsDelta,
  ga4LandingPageFilterForChange,
  summarizeGa4Rows,
} from './measurement/analytics.js'
import { classify } from './measurement/classify.js'
import { dateShift, latestGscDate } from './measurement/dates.js'
import { filterForChange } from './measurement/filters.js'
import { fixed, pct, summarizeRows } from './measurement/math.js'
import type {
  AnalyticsTestMetrics,
  ChangeMeasurement,
  ChangeScope,
  MetricDelta,
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

async function queryAnalyticsMetrics(input: {
  propertyId: string
  startDate: string
  endDate: string
  filter?: unknown
  refresh?: boolean
}): Promise<AnalyticsTestMetrics> {
  const result = await runGa4Report(
    input.propertyId,
    {
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'conversions' },
        { name: 'totalRevenue' },
      ],
      ...(input.filter ? { dimensionFilter: input.filter } : {}),
      limit: 10_000,
    },
    { refresh: input.refresh },
  )
  return summarizeGa4Rows(ga4RowsToObjects(result))
}

function metricDelta(input: {
  before: TestMetrics
  after: TestMetrics
}): MetricDelta {
  return {
    clicks: fixed(input.after.clicks - input.before.clicks),
    clickPct: pct(input.after.clicks, input.before.clicks),
    impressions: fixed(input.after.impressions - input.before.impressions),
    impressionPct: pct(input.after.impressions, input.before.impressions),
    ctr: fixed(input.after.ctr - input.before.ctr, 4),
    position: fixed(input.after.position - input.before.position),
  }
}

async function queryGscWindow(input: {
  change: SeoChange
  before: { startDate: string; endDate: string }
  after: { startDate: string; endDate: string }
  refresh?: boolean
}): Promise<Pick<ChangeMeasurement, 'before' | 'after' | 'delta'>> {
  const group =
    input.change.scope === 'group'
      ? getContentGroup(input.change.target)
      : undefined
  if (input.change.scope === 'group' && !group) {
    throw new Error(`Content group ${input.change.target} was not found.`)
  }

  const filters = filterForChange(input.change, group)
  const [beforeMetrics, afterMetrics] = await Promise.all([
    queryMetrics({
      site: input.change.site,
      ...input.before,
      filters,
      refresh: input.refresh,
    }),
    queryMetrics({
      site: input.change.site,
      ...input.after,
      filters,
      refresh: input.refresh,
    }),
  ])

  return {
    before: { ...input.before, metrics: beforeMetrics },
    after: { ...input.after, metrics: afterMetrics },
    delta: metricDelta({ before: beforeMetrics, after: afterMetrics }),
  }
}

export async function measureChange(input: {
  id?: string
  site?: string
  scope?: ChangeScope
  target?: string
  title?: string
  changedAt?: string
  ga4PropertyId?: string
  controlScope?: ChangeScope
  controlTarget?: string
  controlTitle?: string
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

  const measured = await queryGscWindow({
    change,
    before,
    after,
    refresh: input.refresh,
  })
  const controlChange =
    input.controlScope && input.controlTarget
      ? ({
          id: 'control',
          site: change.site,
          scope: input.controlScope,
          target: input.controlTarget,
          title: input.controlTitle ?? 'Control group',
          changedAt: change.changedAt,
          createdAt: new Date().toISOString(),
        } satisfies SeoChange)
      : undefined
  const control = controlChange
    ? await queryGscWindow({
        change: controlChange,
        before,
        after,
        refresh: input.refresh,
      })
    : undefined
  const clickPct = measured.delta.clickPct
  const verdict = classify({
    before: measured.before.metrics,
    after: measured.after.metrics,
    clickPct,
    clickDelta: measured.delta.clicks,
    positionDelta: measured.delta.position,
  })
  const group =
    change.scope === 'group' ? getContentGroup(change.target) : undefined
  const ga4Filter = ga4LandingPageFilterForChange(change, group)
  const analytics =
    input.ga4PropertyId && change.scope !== 'query'
      ? await (async () => {
          const [beforeMetrics, afterMetrics] = await Promise.all([
            queryAnalyticsMetrics({
              propertyId: input.ga4PropertyId ?? '',
              ...before,
              filter: ga4Filter,
              refresh: input.refresh,
            }),
            queryAnalyticsMetrics({
              propertyId: input.ga4PropertyId ?? '',
              ...after,
              filter: ga4Filter,
              refresh: input.refresh,
            }),
          ])
          return {
            propertyId: input.ga4PropertyId ?? '',
            before: { ...before, metrics: beforeMetrics },
            after: { ...after, metrics: afterMetrics },
            delta: analyticsDelta({
              before: beforeMetrics,
              after: afterMetrics,
            }),
            note: 'GA4 attribution is landing-page based. Query-level tests use GSC only.',
          }
        })()
      : undefined

  return {
    change,
    before: measured.before,
    after: measured.after,
    delta: measured.delta,
    ...(analytics ? { analytics } : {}),
    ...(control && controlChange
      ? {
          control: {
            change: controlChange,
            ...control,
            adjusted: {
              clickDelta: fixed(measured.delta.clicks - control.delta.clicks),
              clickPctPoints:
                measured.delta.clickPct === null ||
                control.delta.clickPct === null
                  ? null
                  : fixed(measured.delta.clickPct - control.delta.clickPct),
              impressionDelta: fixed(
                measured.delta.impressions - control.delta.impressions,
              ),
              impressionPctPoints:
                measured.delta.impressionPct === null ||
                control.delta.impressionPct === null
                  ? null
                  : fixed(
                      measured.delta.impressionPct -
                        control.delta.impressionPct,
                    ),
            },
            note: 'Control groups reduce seasonality noise but do not prove causality on their own.',
          },
        }
      : {}),
    ...verdict,
  }
}
