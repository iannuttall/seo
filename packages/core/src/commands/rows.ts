import { collapseFragmentPageRows } from '../analyze/page-fragments.js'
import type { SearchAnalyticsRequest } from '../gsc/client/types.js'
import type { Detail } from './present.js'
import { table } from './present.js'
import {
  type DateInput,
  dateWindow,
  earlierRange,
  FACTS_ONLY,
  originOf,
} from './shared.js'
import type { CommandDeps, CommandResult } from './types.js'

type Row = Record<string, unknown>

export const PAGE_SIZE = 50

// Rows as a table, a page at a time.
export function rowsText(input: {
  title: string
  rows: Row[]
  offset: number
  limit: number
  detail: Detail
  notes?: string[]
  origin?: string | null
  more?: (offset: number) => string
}): string {
  const total = input.rows.length
  if (input.detail === 'full') {
    return `${input.title}\n\n${JSON.stringify(input.rows.slice(input.offset, input.offset + input.limit))}`
  }
  const size =
    input.detail === 'summary' ? Math.min(input.limit, 25) : input.limit
  const page = input.rows.slice(input.offset, input.offset + size)
  const columns = [...new Set(page.flatMap((row) => Object.keys(row)))]
  const end = input.offset + page.length
  return [
    input.title,
    ...(input.notes ?? []),
    total === 0
      ? 'No rows.'
      : `Rows ${input.offset + 1} to ${end} of ${total}:\n${table(page, columns, input.origin ?? null)}`,
    end < total
      ? `More: ${input.more ? input.more(end) : `detail "rows", offset ${end}`}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const DIMENSIONS = [
  'query',
  'page',
  'date',
  'country',
  'device',
  'searchAppearance',
] as const

export type Dimension = (typeof DIMENSIONS)[number]

export type RowFilter = {
  dimension: Exclude<Dimension, 'date'>
  operator:
    | 'contains'
    | 'equals'
    | 'notContains'
    | 'notEquals'
    | 'includingRegex'
    | 'excludingRegex'
  expression: string
}

export type RowsInput = DateInput & {
  site: string
  dimensions?: Dimension[]
  filters?: RowFilter[]
  detail?: Detail
  offset?: number
}

// Most Search Console rows read per period.
const ROWS = 25_000

// Search Console rows for any dimensions and filters, each beside the same
// rows from the previous period.
export async function runRows(
  input: RowsInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  const dimensions = input.dimensions?.length ? input.dimensions : ['query']
  const filters = input.filters ?? []
  const range = dateWindow(input, 28)
  const previous = earlierRange(range)
  const query: Omit<SearchAnalyticsRequest, 'startDate' | 'endDate'> = {
    dimensions,
    type: 'web',
    maxRows: ROWS,
    ...(filters.length
      ? { dimensionFilterGroups: [{ groupType: 'and' as const, filters }] }
      : {}),
  }
  const [current, before] = await Promise.all([
    deps.searchAnalytics(input.site, { ...query, ...range }),
    deps.searchAnalytics(input.site, { ...query, ...previous }),
  ])
  const pageAt = dimensions.indexOf('page')
  // Page URLs with #fragments are one page; their rows merge.
  const merge = (rows: typeof current.rows) =>
    pageAt < 0
      ? rows
      : collapseFragmentPageRows(rows, { pageKeyIndex: pageAt }).rows
  const now = merge(current.rows)
  const then = merge(before.rows)
  const name = (keys: string[]) => keys.join('\u0000')
  // Dates never match across periods, so a date row pairs with the date the
  // same number of days into the earlier period.
  const dateAt = dimensions.indexOf('date')
  const keyOf = (keys: string[], start: string) =>
    name(
      keys.map((key, index) =>
        index === dateAt
          ? String(
              Math.round((Date.parse(key) - Date.parse(start)) / 86_400_000),
            )
          : key,
      ),
    )
  const earlier = new Map(
    then.map((row) => [keyOf(row.keys, previous.startDate), row]),
  )
  const seen = new Set<string>()
  const rows: Row[] = now.map((row) => {
    const key = keyOf(row.keys, range.startDate)
    seen.add(key)
    const old = earlier.get(key)
    return {
      ...Object.fromEntries(dimensions.map((d, i) => [d, row.keys[i]])),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      ...(dateAt >= 0 ? { previous_date: old?.keys[dateAt] ?? null } : {}),
      previous_clicks: old?.clicks ?? 0,
      clicks_change: row.clicks - (old?.clicks ?? 0),
      previous_position: old?.position ?? null,
    }
  })
  if (dateAt < 0) {
    for (const old of then) {
      if (seen.has(keyOf(old.keys, previous.startDate))) continue
      rows.push({
        ...Object.fromEntries(dimensions.map((d, i) => [d, old.keys[i]])),
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: null,
        previous_clicks: old.clicks,
        clicks_change: -old.clicks,
        previous_position: old.position,
      })
    }
  }
  rows.sort((a, b) =>
    dateAt >= 0
      ? String(a.date).localeCompare(String(b.date))
      : Number(b.clicks ?? 0) - Number(a.clicks ?? 0),
  )
  const notes: string[] = []
  // Rows split only by date, device, country or appearance add up to the
  // property totals; query and page rows do not.
  if (!dimensions.includes('query') && !dimensions.includes('page')) {
    const sum = (key: string) =>
      rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
    notes.push(
      `Totals: clicks ${sum('clicks')}, impressions ${sum('impressions')}; previous period clicks ${sum('previous_clicks')}.`,
    )
  }
  notes.push(
    `Compared with ${previous.startDate} to ${previous.endDate}${before.rowsFetched >= ROWS ? ' (earlier period hit the row limit)' : ''}. 0 clicks with no position means the row had no impressions in the current period.`,
  )
  if (pageAt >= 0) {
    notes.push('Page URLs with #fragments are merged into their page.')
  }
  if (current.rowsFetched >= ROWS) {
    notes.push(
      `Search Console has more than ${ROWS} rows; add a filter to narrow it.`,
    )
  }
  notes.push(
    'Search Console hides some rare queries for privacy, so query rows do not add up to the site totals.',
  )
  const detail = input.detail ?? 'summary'
  return {
    text: `${rowsText({
      title: `Search Console ${input.site}, ${range.startDate} to ${range.endDate}, web, by ${dimensions.join(' and ')}.`,
      rows,
      offset: input.offset ?? 0,
      limit: PAGE_SIZE,
      detail,
      notes,
      origin: originOf(input.site),
      more: (offset) =>
        deps.call('data', {
          site: input.site,
          dimensions: dimensions.join(','),
          detail: 'rows',
          offset,
        }),
    })}\n\n${FACTS_ONLY}`,
    data: {
      range,
      comparisonRange: previous,
      total: rows.length,
      offset: input.offset ?? 0,
      rows: rows.slice(input.offset ?? 0, (input.offset ?? 0) + PAGE_SIZE),
    },
  }
}
