import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SeoError } from '../../errors.js'
import type { GscRow } from '../../types.js'
import {
  type MeasureChangeDependencies,
  measureChange,
} from './measure-change.js'
import type { ContentGroup } from './types.js'

type GscRequest = {
  startDate: string
  endDate: string
  dimensions?: string[]
}

function dependencies(
  input: {
    now?: string
    requests?: GscRequest[]
    rows?: GscRow[]
    googleAnalyticsResult?: unknown
    googleAnalyticsRequests?: unknown[]
    contentGroups?: ContentGroup[]
  } = {},
): MeasureChangeDependencies {
  return {
    now: () => new Date(input.now ?? '2026-07-09T12:00:00.000Z'),
    searchAnalytics: async (_site, request) => {
      input.requests?.push(request)
      const rows =
        input.rows ??
        ([
          {
            keys: [request.startDate],
            clicks: request.startDate < '2026-07-01' ? 100 : 10,
            impressions: 1_000,
            ctr: request.startDate < '2026-07-01' ? 0.1 : 0.01,
            position: request.startDate < '2026-07-01' ? 3 : 10,
          },
        ] satisfies GscRow[])
      return { rows, calls: 1, rowsFetched: rows.length }
    },
    googleAnalyticsReport: async (_propertyId, request) => {
      input.googleAnalyticsRequests?.push(request)
      return (input.googleAnalyticsResult ?? {
        dimensionHeaders: [{ name: 'date' }],
        metricHeaders: [
          { name: 'sessions', type: 'TYPE_INTEGER' },
          { name: 'engagedSessions', type: 'TYPE_INTEGER' },
          { name: 'conversions', type: 'TYPE_FLOAT' },
          { name: 'totalRevenue', type: 'TYPE_CURRENCY' },
        ],
        rows: [],
        rowCount: 0,
      }) as never
    },
    contentGroup: (id) => input.contentGroups?.find((group) => group.id === id),
  }
}

const change = {
  site: 'sc-domain:example.com',
  scope: 'site' as const,
  target: 'sitewide',
  title: 'Template release',
  changedAt: '2026-07-01',
}

test('measureChange uses equal finalized windows and withholds a partial verdict', async () => {
  const requests: GscRequest[] = []
  const result = await measureChange(change, dependencies({ requests }))

  assert.deepEqual(
    requests.map(({ startDate, endDate }) => ({ startDate, endDate })),
    [
      { startDate: '2026-06-26', endDate: '2026-06-30' },
      { startDate: '2026-07-01', endDate: '2026-07-05' },
    ],
  )
  assert.equal(result.window.requestedDays, 28)
  assert.equal(result.window.effectiveDays, 5)
  assert.equal(result.window.afterWindowTruncated, true)
  assert.equal(result.dataStatus, 'partial')
  assert.equal(result.verdict, 'not-enough-data')
  assert.equal(result.confidence, 'low')
  assert.equal(result.source.searchAnalytics.before.rowsFetched, 1)
})

test('measureChange validates windows before provider calls at the Pacific boundary', async () => {
  const requests: GscRequest[] = []
  const deps = dependencies({
    now: '2026-07-09T00:30:00.000Z',
    requests,
  })

  for (const input of [
    { ...change, changedAt: 'not-a-date' },
    { ...change, changedAt: '2026-07-05' },
    { ...change, beforeDays: 0, afterDays: 0 },
    { ...change, beforeDays: 1.5, afterDays: 1.5 },
    { ...change, beforeDays: 7, afterDays: 14 },
    { ...change, changedAt: '2025-03-05' },
  ]) {
    await assert.rejects(measureChange(input, deps), SeoError)
  }
  assert.equal(requests.length, 0)
})

test('measureChange exposes Google Analytics quality warnings as partial evidence', async () => {
  const googleAnalyticsResult = {
    dimensionHeaders: [{ name: 'date' }],
    metricHeaders: [
      { name: 'sessions', type: 'TYPE_INTEGER' },
      { name: 'engagedSessions', type: 'TYPE_INTEGER' },
      { name: 'conversions', type: 'TYPE_FLOAT' },
      { name: 'totalRevenue', type: 'TYPE_CURRENCY' },
    ],
    rows: [
      {
        dimensionValues: [{ value: '20260601' }],
        metricValues: [
          { value: '10' },
          { value: '8' },
          { value: '1' },
          { value: '20' },
        ],
      },
    ],
    rowCount: 1,
    metadata: {
      timeZone: 'Europe/London',
      currencyCode: 'GBP',
      dataLossFromOtherRow: true,
      subjectToThresholding: true,
      samplingMetadatas: [{ samplesReadCount: '50', samplingSpaceSize: '100' }],
    },
  }
  const result = await measureChange(
    { ...change, changedAt: '2026-05-01', googleAnalyticsPropertyId: '123' },
    dependencies({ googleAnalyticsResult }),
  )

  assert.equal(result.dataStatus, 'partial')
  assert.equal(result.source.analytics?.status, 'partial')
  assert.equal(result.source.analytics?.before.timeZone, 'Europe/London')
  assert.equal(result.source.analytics?.before.currencyCode, 'GBP')
  assert.equal(result.window.gscTimezone, 'America/Los_Angeles')
  assert.equal(result.warnings.length, 6)
  assert.match(result.warnings.join(' '), /\(other\).*thresholding.*sampled/)
  assert.match(
    result.caveats.join(' '),
    /Google Analytics property timezone \(Europe\/London\)/,
  )
})

test('measureChange withholds direction for windows shorter than seven days', async () => {
  const result = await measureChange(
    { ...change, changedAt: '2026-05-01', beforeDays: 1, afterDays: 1 },
    dependencies(),
  )

  assert.equal(result.dataStatus, 'complete')
  assert.equal(result.verdict, 'not-enough-data')
  assert.equal(result.confidence, 'low')
  assert.match(result.note, /Only 1 finalized day/)
})

test('query-scoped missing rows stay unavailable instead of becoming a loss', async () => {
  const deps = dependencies()
  deps.searchAnalytics = async (_site, request) => {
    if (request.startDate >= '2026-05-01') {
      return { rows: [], calls: 1, rowsFetched: 0 }
    }
    const rows: GscRow[] = [
      {
        keys: [request.startDate],
        clicks: 100,
        impressions: 1_000,
        ctr: 0.1,
        position: 3,
      },
    ]
    return { rows, calls: 1, rowsFetched: rows.length }
  }

  const result = await measureChange(
    {
      ...change,
      scope: 'query',
      target: 'example query',
      changedAt: '2026-05-01',
    },
    deps,
  )

  assert.equal(result.dataStatus, 'partial')
  assert.equal(result.verdict, 'not-enough-data')
  assert.equal(result.after.metrics, null)
  assert.equal(result.delta.clicks, null)
  assert.equal(
    result.source.searchAnalytics.completeness,
    'retained-query-date-aggregates',
  )
})

test('invalid provider calendar dates cannot support a directional verdict', async () => {
  const deps = dependencies()
  deps.searchAnalytics = async (_site, request) => {
    const after = request.startDate >= '2026-02-01'
    const rows: GscRow[] = [
      {
        keys: [after ? '2026-02-30' : request.startDate],
        clicks: 100,
        impressions: 1_000,
        ctr: 0.1,
        position: 3,
      },
    ]
    return { rows, calls: 1, rowsFetched: rows.length }
  }

  const result = await measureChange(
    { ...change, changedAt: '2026-02-01' },
    deps,
  )

  assert.equal(result.dataStatus, 'partial')
  assert.equal(result.verdict, 'not-enough-data')
  assert.equal(result.source.searchAnalytics.after.returnedRows, 0)
  assert.equal(result.source.searchAnalytics.after.invalidRows, 1)
})

test('control adjustment normalizes proportional movement across scales', async () => {
  const deps = dependencies()
  deps.searchAnalytics = async (_site, request) => {
    const control = JSON.stringify(request.dimensionFilterGroups).includes(
      'control query',
    )
    const after = request.startDate >= '2026-05-01'
    const clicks = control ? (after ? 90 : 100) : after ? 900 : 1_000
    const impressions = control ? (after ? 900 : 1_000) : after ? 9_000 : 10_000
    const rows: GscRow[] = [
      {
        keys: [request.startDate],
        clicks,
        impressions,
        ctr: clicks / impressions,
        position: 3,
      },
    ]
    return { rows, calls: 1, rowsFetched: rows.length }
  }

  const result = await measureChange(
    {
      ...change,
      scope: 'query',
      target: 'treatment query',
      changedAt: '2026-05-01',
      controlScope: 'query',
      controlTarget: 'control query',
    },
    deps,
  )

  assert.equal(result.control?.adjusted.clickDelta, 0)
  assert.equal(result.control?.adjusted.impressionDelta, 0)
  assert.equal(result.control?.adjusted.clickPctPoints, 0)
})

test('query content groups do not attach unfiltered sitewide Google Analytics', async () => {
  const googleAnalyticsRequests: unknown[] = []
  const group: ContentGroup = {
    id: 'query-group',
    site: change.site,
    name: 'Branded queries',
    dimension: 'query',
    matchType: 'contains',
    pattern: 'example',
    createdAt: '2026-04-01T00:00:00.000Z',
  }

  const result = await measureChange(
    {
      ...change,
      scope: 'group',
      target: group.id,
      changedAt: '2026-05-01',
      googleAnalyticsPropertyId: '123',
    },
    dependencies({ googleAnalyticsRequests, contentGroups: [group] }),
  )

  assert.equal(googleAnalyticsRequests.length, 0)
  assert.equal(result.analytics, undefined)
  assert.equal(result.source.analytics, undefined)
})

test('content groups cannot be measured against another site', async () => {
  const requests: GscRequest[] = []
  const googleAnalyticsRequests: unknown[] = []
  const group: ContentGroup = {
    id: 'foreign-group',
    site: 'sc-domain:other.example',
    name: 'Foreign pages',
    dimension: 'page',
    matchType: 'contains',
    pattern: '/docs/',
    createdAt: '2026-04-01T00:00:00.000Z',
  }

  await assert.rejects(
    measureChange(
      {
        ...change,
        scope: 'group',
        target: group.id,
        changedAt: '2026-05-01',
        googleAnalyticsPropertyId: '123',
      },
      dependencies({
        requests,
        googleAnalyticsRequests,
        contentGroups: [group],
      }),
    ),
    (error) =>
      error instanceof SeoError &&
      error.code === 'INVALID_INPUT' &&
      /belongs to/.test(error.message),
  )
  assert.equal(requests.length, 0)
  assert.equal(googleAnalyticsRequests.length, 0)
})

test('foreign control groups fail before treatment provider calls', async () => {
  const requests: GscRequest[] = []
  const group: ContentGroup = {
    id: 'foreign-control',
    site: 'sc-domain:other.example',
    name: 'Foreign control',
    dimension: 'query',
    matchType: 'contains',
    pattern: 'control',
    createdAt: '2026-04-01T00:00:00.000Z',
  }

  await assert.rejects(
    measureChange(
      {
        ...change,
        changedAt: '2026-05-01',
        controlScope: 'group',
        controlTarget: group.id,
      },
      dependencies({ requests, contentGroups: [group] }),
    ),
    (error) =>
      error instanceof SeoError &&
      error.code === 'INVALID_INPUT' &&
      /belongs to/.test(error.message),
  )
  assert.equal(requests.length, 0)
})

test('zero-click growth is not classified as flat or infinite', async () => {
  const deps = dependencies()
  deps.searchAnalytics = async (_site, request) => {
    const after = request.startDate >= '2026-05-01'
    const rows: GscRow[] = [
      {
        keys: [request.startDate],
        clicks: after ? 100 : 0,
        impressions: 1_000,
        ctr: after ? 0.1 : 0,
        position: 5,
      },
    ]
    return { rows, calls: 1, rowsFetched: rows.length }
  }

  const result = await measureChange(
    { ...change, changedAt: '2026-05-01', beforeDays: 7, afterDays: 7 },
    deps,
  )

  assert.equal(result.verdict, 'positive')
  assert.equal(result.confidence, 'low')
  assert.equal(result.delta.clickPct, null)
  assert.match(result.note, /zero-click baseline/)
})

test('position movement is unavailable when a window has no impressions', async () => {
  const deps = dependencies()
  deps.searchAnalytics = async (_site, request) => {
    const after = request.startDate >= '2026-05-01'
    const rows: GscRow[] = [
      {
        keys: [request.startDate],
        clicks: 0,
        impressions: after ? 1_000 : 0,
        ctr: 0,
        position: after ? 5 : 0,
      },
    ]
    return { rows, calls: 1, rowsFetched: rows.length }
  }

  const result = await measureChange(
    { ...change, changedAt: '2026-05-01', beforeDays: 7, afterDays: 7 },
    deps,
  )

  assert.equal(result.delta.position, null)
  assert.equal(result.verdict, 'not-enough-data')
})

test('measureChange propagates provider failures', async () => {
  const deps = dependencies()
  deps.searchAnalytics = async () => {
    throw new SeoError('AUTH_EXPIRED', 'Login expired.')
  }

  await assert.rejects(
    measureChange({ ...change, changedAt: '2026-05-01' }, deps),
    (error) => error instanceof SeoError && error.code === 'AUTH_EXPIRED',
  )
})
