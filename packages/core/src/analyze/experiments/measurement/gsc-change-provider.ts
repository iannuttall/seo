import type {
  querySearchAnalytics,
  SearchAnalyticsRequest,
} from '../../../gsc/client.js'
import type { GscRow } from '../../../types.js'
import type {
  ChangeMeasurement,
  ContentGroup,
  MetricDelta,
  SeoChange,
  TestMetrics,
} from '../types.js'
import { filterForChange } from './filters.js'
import { fixed, pct, summarizeRows } from './math.js'

type Window = { startDate: string; endDate: string }
type GscWindowSource = {
  calls: number
  rowsFetched: number
  returnedRows: number
  invalidRows: number
  duplicateRows: number
}

function validDateRow(row: GscRow, window: Window): boolean {
  const date = row.keys[0]
  if (!date) return false
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return (
    row.keys.length === 1 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    date >= window.startDate &&
    date <= window.endDate &&
    [row.clicks, row.impressions, row.ctr, row.position].every(
      Number.isFinite,
    ) &&
    row.clicks >= 0 &&
    row.impressions >= 0 &&
    row.clicks <= row.impressions &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    (row.impressions === 0 ? row.position >= 0 : row.position >= 1)
  )
}

function retainedDateRows(rows: GscRow[], window: Window) {
  const byDate = new Map<string, GscRow>()
  const conflicts = new Set<string>()
  let invalidRows = 0
  let duplicateRows = 0
  for (const row of rows) {
    if (!validDateRow(row, window)) {
      invalidRows += 1
      continue
    }
    const date = row.keys[0] ?? ''
    if (conflicts.has(date)) {
      invalidRows += 1
      continue
    }
    const previous = byDate.get(date)
    if (!previous) {
      byDate.set(date, row)
      continue
    }
    const same =
      previous.clicks === row.clicks &&
      previous.impressions === row.impressions &&
      previous.ctr === row.ctr &&
      previous.position === row.position
    if (same) {
      duplicateRows += 1
      continue
    }
    byDate.delete(date)
    conflicts.add(date)
    invalidRows += 2
  }
  return {
    rows: [...byDate.values()].sort((left, right) => {
      const leftDate = left.keys[0] ?? ''
      const rightDate = right.keys[0] ?? ''
      return leftDate < rightDate ? -1 : leftDate > rightDate ? 1 : 0
    }),
    invalidRows,
    duplicateRows,
  }
}

async function queryGscMetrics(input: {
  site: string
  window: Window
  filters?: SearchAnalyticsRequest['dimensionFilterGroups']
  refresh?: boolean
  searchAnalytics: typeof querySearchAnalytics
}): Promise<{ metrics: TestMetrics; source: GscWindowSource }> {
  const result = await input.searchAnalytics(
    input.site,
    {
      ...input.window,
      dimensions: ['date'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: input.filters,
    },
    { refresh: input.refresh },
  )
  const retained = retainedDateRows(result.rows, input.window)
  return {
    metrics: summarizeRows(retained.rows),
    source: {
      calls: result.calls,
      rowsFetched: result.rowsFetched,
      returnedRows: retained.rows.length,
      invalidRows: retained.invalidRows,
      duplicateRows: retained.duplicateRows,
    },
  }
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
    position:
      input.before.impressions > 0 && input.after.impressions > 0
        ? fixed(input.after.position - input.before.position)
        : null,
  }
}

export async function queryGscChangeWindows(input: {
  change: SeoChange
  before: Window
  after: Window
  group?: ContentGroup
  refresh?: boolean
  searchAnalytics: typeof querySearchAnalytics
}): Promise<
  Pick<ChangeMeasurement, 'before' | 'after' | 'delta'> & {
    status: 'complete' | 'partial'
    completeness: 'date-aggregates' | 'retained-query-date-aggregates'
    comparable: boolean
    warnings: string[]
    source: { before: GscWindowSource; after: GscWindowSource }
  }
> {
  const filters = filterForChange(input.change, input.group)
  const retainedQueryEvidence =
    input.change.scope === 'query' || input.group?.dimension === 'query'
  const [before, after] = await Promise.all([
    queryGscMetrics({
      site: input.change.site,
      window: input.before,
      filters,
      refresh: input.refresh,
      searchAnalytics: input.searchAnalytics,
    }),
    queryGscMetrics({
      site: input.change.site,
      window: input.after,
      filters,
      refresh: input.refresh,
      searchAnalytics: input.searchAnalytics,
    }),
  ])
  const warnings: string[] = []
  const invalidRows = before.source.invalidRows + after.source.invalidRows
  if (invalidRows) {
    warnings.push(
      `Excluded ${invalidRows} invalid or conflicting Search Console date rows.`,
    )
  }
  if (retainedQueryEvidence) {
    warnings.push(
      'Query-scoped Search Console evidence contains retained query data and can omit anonymized queries.',
    )
  }
  const unusableBefore =
    before.source.rowsFetched > 0 &&
    before.source.returnedRows === 0 &&
    before.source.invalidRows > 0
  const unusableAfter =
    after.source.rowsFetched > 0 &&
    after.source.returnedRows === 0 &&
    after.source.invalidRows > 0
  const comparable =
    !unusableBefore &&
    !unusableAfter &&
    (!retainedQueryEvidence ||
      (before.source.returnedRows > 0 && after.source.returnedRows > 0))
  if (!comparable) {
    warnings.push(
      retainedQueryEvidence
        ? 'A query-scoped window returned no retained rows; absence was not converted into zero movement.'
        : 'A Search Console window contained provider rows but none were valid; the window was not converted into zero movement.',
    )
  }
  const beforeMetrics =
    unusableBefore ||
    (retainedQueryEvidence && before.source.returnedRows === 0)
      ? null
      : before.metrics
  const afterMetrics =
    unusableAfter || (retainedQueryEvidence && after.source.returnedRows === 0)
      ? null
      : after.metrics
  return {
    before: { ...input.before, metrics: beforeMetrics },
    after: { ...input.after, metrics: afterMetrics },
    delta:
      beforeMetrics && afterMetrics
        ? metricDelta({ before: beforeMetrics, after: afterMetrics })
        : {
            clicks: null,
            clickPct: null,
            impressions: null,
            impressionPct: null,
            ctr: null,
            position: null,
          },
    status: retainedQueryEvidence || invalidRows > 0 ? 'partial' : 'complete',
    completeness: retainedQueryEvidence
      ? 'retained-query-date-aggregates'
      : 'date-aggregates',
    comparable,
    warnings,
    source: { before: before.source, after: after.source },
  }
}
