import { z } from 'zod'
import { collapseFragmentPageRows } from '../analyze/page-fragments.js'
import { SeoError } from '../errors.js'
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
    const page = input.rows.slice(input.offset, input.offset + input.limit)
    const end = input.offset + page.length
    // Say when the JSON is one page of more, and how to get the next.
    const cut =
      end < total
        ? `\n\nRows ${input.offset + 1} to ${end} of ${total}. More: ${input.more ? input.more(end).replace('detail "rows"', 'detail "full"').replace('--detail rows', '--detail full') : `detail "full", offset ${end}`}.`
        : ''
    return `${input.title}\n\n${JSON.stringify(page)}${cut}`
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

// Queries that look like spam or tool noise rather than people searching.
// A heuristic over the query text only, so it labels and never drops.
const SPAM_TLDS = /\.(xyz|top|click|buzz|icu|cfd|sbs|monster|rest|lol)$/
export function spamHint(query: string): string | null {
  const text = query.trim().toLowerCase()
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(text) && SPAM_TLDS.test(text)) {
    return 'host name on a TLD common in referral spam'
  }
  if (/^\d+: /.test(text) || /\btest keyword\b/.test(text)) {
    return 'rank tracker test query'
  }
  if ((text.match(/[=,]/g) ?? []).length >= 6 && /"/.test(text)) {
    return 'pasted spreadsheet or tool export'
  }
  return null
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

// Search Console's surfaces. web is the All tab; image, video and news are
// Google Search's own tabs; discover and google_news are outside search.
export const SEARCH_TYPES = {
  web: 'web',
  image: 'image',
  video: 'video',
  news: 'news',
  discover: 'discover',
  google_news: 'googleNews',
} as const

export type SearchType = keyof typeof SEARCH_TYPES

export const SEARCH_TYPE_NAMES: Record<SearchType, string> = {
  web: 'web search',
  image: 'image search',
  video: 'video search',
  news: 'the News tab',
  discover: 'Discover',
  google_news: 'Google News',
}

// Discover and Google News have no queries and no average position.
export const NO_QUERIES = new Set<SearchType>(['discover', 'google_news'])

// What each surface is, beside the rows.
const SURFACE_NOTES: Partial<Record<SearchType, string>> = {
  image:
    'Image search: results shown in the Google Images tab. Web search totals do not include it.',
  video:
    'Video search: results shown in the Google Videos tab. Web search totals do not include it.',
  news: 'The News tab: results in Google Search’s News tab and news results view. Google News (the app and news.google.com) is search_type google_news.',
  discover:
    'Discover is Google’s feed: pages shown without a search, so there are no queries or positions.',
  google_news:
    'Google News is news.google.com and the Google News app, not the News tab in Google Search. It has no queries or positions.',
}

// From Google's Discover guide: the report needs a minimum of impressions.
export const DISCOVER_MINIMUM =
  'Search Console reports Discover only once a site reaches a minimum number of impressions, so a site below it shows none.'

// One line for the agent on what the rows mean and what to ask first.
export const SURFACE_GUIDES: Partial<Record<SearchType, string>> = {
  image:
    'compare pages with each other, since a much lower click-through rate than web search is common in the Images tab. Ask the person whether visits from image search matter to them before suggesting work.',
  video:
    'videos inside web results count under web search, by the searchAppearance dimension. Ask the person whether video matters to them before suggesting work.',
  news: 'these matter when the person publishes news; for other sites they need no work.',
  discover:
    'there are no queries to target. Ask the person whether Discover matters to them before suggesting work.',
  google_news:
    'these matter when the person publishes news; for other sites they need no work.',
}

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

// Search Console takes RE2 expressions of at most 4,096 characters.
export const REGEX_MAX_CHARS = 4096

// seo_data's Search Console inputs.
export const rowsInput = {
  page: z
    .string()
    .min(1)
    .optional()
    .describe('search_console only: URL text, such as /blog/.'),
  query: z
    .string()
    .min(1)
    .optional()
    .describe('search_console only: query text.'),
  search_type: z
    .enum(Object.keys(SEARCH_TYPES) as [SearchType, ...SearchType[]])
    .default('web')
    .describe(
      'search_console only. web (default) is the All tab; image, video and news are the Images, Videos and News tabs; discover is the Discover feed; google_news is the Google News app and site. discover and google_news have pages but no queries or positions.',
    ),
  page_regex: z
    .string()
    .min(1)
    .max(REGEX_MAX_CHARS)
    .optional()
    .describe('search_console only: RE2 the page URL must match.'),
  query_regex: z
    .string()
    .min(1)
    .max(REGEX_MAX_CHARS)
    .optional()
    .describe('search_console only: RE2 the query must match.'),
  exclude_query_regex: z
    .string()
    .min(1)
    .max(REGEX_MAX_CHARS)
    .optional()
    .describe(
      'search_console only: RE2 for queries to leave out, such as the brand.',
    ),
}

export type RowTextFilters = {
  page?: string
  query?: string
  pageRegex?: string
  queryRegex?: string
  excludeQueryRegex?: string
}

// The page and query text filters shared by the CLI and the MCP tool.
export function rowTextFilters(input: RowTextFilters): RowFilter[] {
  const filters: [RowFilter['dimension'], RowFilter['operator'], string?][] = [
    ['page', 'contains', input.page],
    ['query', 'contains', input.query],
    ['page', 'includingRegex', input.pageRegex],
    ['query', 'includingRegex', input.queryRegex],
    ['query', 'excludingRegex', input.excludeQueryRegex],
  ]
  return filters.flatMap(([dimension, operator, expression]) => {
    if (!expression) return []
    if (operator !== 'contains') checkRegex(expression)
    return [{ dimension, operator, expression }]
  })
}

// Search Console answers an expression it can't read with no rows, which
// looks like a real zero, so reject what RE2 lacks before asking.
function checkRegex(expression: string) {
  if (expression.length > REGEX_MAX_CHARS) {
    throw new SeoError(
      'INVALID_INPUT',
      `Search Console takes regular expressions of at most ${REGEX_MAX_CHARS} characters.`,
    )
  }
  if (/\(\?<?[=!]|\\[1-9]/.test(expression)) {
    throw new SeoError(
      'INVALID_INPUT',
      `Search Console uses RE2, which has no lookarounds such as (?=...) or (?!...) and no backreferences such as \\1. Use an exclude filter instead of a negative lookahead: ${expression}`,
    )
  }
}

export type RowsInput = DateInput & {
  site: string
  dimensions?: Dimension[]
  filters?: RowFilter[]
  searchType?: SearchType
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
  const searchType = input.searchType ?? 'web'
  const surface = SEARCH_TYPE_NAMES[searchType]
  const noQueries = NO_QUERIES.has(searchType)
  const dimensions = input.dimensions?.length
    ? input.dimensions
    : [noQueries ? 'page' : 'query']
  const filters = input.filters ?? []
  // A query cut of Discover can only come back empty, which would look like
  // a real zero.
  if (
    NO_QUERIES.has(searchType) &&
    (dimensions.includes('query') ||
      filters.some((filter) => filter.dimension === 'query'))
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${surface} has no queries in Search Console, only pages. Ask for dimensions page, date, country, device or searchAppearance, without query filters.`,
    )
  }
  const range = dateWindow(input, 28)
  const previous = earlierRange(range)
  const query: Omit<SearchAnalyticsRequest, 'startDate' | 'endDate'> = {
    dimensions,
    type: SEARCH_TYPES[searchType],
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
  // Discover and Google News report no position, so the column is left out.
  const at = (position: number | null) => (noQueries ? {} : { position })
  const before_ = (position: number | null) =>
    noQueries ? {} : { previous_position: position }
  const rows: Row[] = now.map((row) => {
    const key = keyOf(row.keys, range.startDate)
    seen.add(key)
    const old = earlier.get(key)
    return {
      ...Object.fromEntries(dimensions.map((d, i) => [d, row.keys[i]])),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      ...at(row.position),
      ...(dateAt >= 0 ? { previous_date: old?.keys[dateAt] ?? null } : {}),
      previous_clicks: old?.clicks ?? 0,
      clicks_change: row.clicks - (old?.clicks ?? 0),
      ...before_(old?.position ?? null),
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
        ...at(null),
        previous_clicks: old.clicks,
        clicks_change: -old.clicks,
        ...before_(old.position),
      })
    }
  }
  // Most clicks first, then most impressions, so surfaces with few clicks
  // such as image search still sort by size; keys break the last ties.
  const keysOf = (row: Row) => dimensions.map((d) => String(row[d])).join(' ')
  rows.sort((a, b) =>
    dateAt >= 0
      ? String(a.date).localeCompare(String(b.date))
      : Number(b.clicks ?? 0) - Number(a.clicks ?? 0) ||
        Number(b.impressions ?? 0) - Number(a.impressions ?? 0) ||
        keysOf(a).localeCompare(keysOf(b)),
  )
  const notes: string[] = []
  // Spam-looking queries keep their numbers and get a label, so totals stay
  // Search Console's own.
  const queryAt = dimensions.indexOf('query')
  if (queryAt >= 0) {
    const flagged = rows.filter((row) => spamHint(String(row.query ?? '')))
    if (flagged.length) {
      for (const row of rows) row.spam_hint = spamHint(String(row.query ?? ''))
      const impressions = flagged.reduce(
        (sum, row) => sum + Number(row.impressions ?? 0),
        0,
      )
      notes.push(
        `${flagged.length} of ${rows.length} queries look like spam or tool noise (spam_hint, a heuristic over the query text: host names on spam-heavy TLDs, rank tracker test queries, pasted exports), with ${impressions} impressions. They stay in the rows and the totals; Google may or may not count them as real searches.`,
      )
    }
  }
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
    `Compared with ${previous.startDate} to ${previous.endDate}${before.rowsFetched >= ROWS ? ' (earlier period hit the row limit)' : ''}. ${noQueries ? '0 clicks and 0 impressions' : '0 clicks with no position'} means the row had no impressions in the current period.`,
  )
  const surfaceNote = SURFACE_NOTES[searchType]
  if (surfaceNote) notes.push(surfaceNote)
  // Seen live: a Discover total of 1 impression with no page rows.
  if (noQueries) {
    notes.push(
      `Search Console can count ${surface} impressions in the site total and leave them out of these rows, so few or no rows is not proof of none. The report overview gives the total.${searchType === 'discover' ? ` ${DISCOVER_MINIMUM}` : ''}`,
    )
  }
  if (pageAt >= 0) {
    notes.push('Page URLs with #fragments are merged into their page.')
  }
  if (current.rowsFetched >= ROWS) {
    notes.push(
      `Search Console has more than ${ROWS} rows; add a filter to narrow it.`,
    )
  }
  if (!noQueries) {
    notes.push(
      'Search Console hides some rare queries for privacy, so query rows do not add up to the site totals.',
    )
  }
  const guide = SURFACE_GUIDES[searchType]
  if (guide && rows.length) notes.push(`How to use these rows: ${guide}`)
  const detail = input.detail ?? 'summary'
  return {
    text: `${rowsText({
      title: `Search Console ${input.site}, ${range.startDate} to ${range.endDate}, ${surface}, by ${dimensions.join(' and ')}.`,
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
          ...(searchType === 'web' ? {} : { search_type: searchType }),
          detail: 'rows',
          offset,
        }),
    })}\n\n${FACTS_ONLY}`,
    data: {
      range,
      comparisonRange: previous,
      searchType,
      total: rows.length,
      offset: input.offset ?? 0,
      rows: rows.slice(input.offset ?? 0, (input.offset ?? 0) + PAGE_SIZE),
    },
  }
}
