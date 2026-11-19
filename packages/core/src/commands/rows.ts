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
  'brandedClassification',
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
  multimodal: 'webMultimodal',
} as const

export type SearchType = keyof typeof SEARCH_TYPES

export const SEARCH_TYPE_NAMES: Record<SearchType, string> = {
  web: 'web search',
  image: 'image search',
  video: 'video search',
  news: 'the News tab',
  discover: 'Discover',
  google_news: 'Google News',
  multimodal: 'Google Lens and Circle to Search',
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
  multimodal:
    'Google Lens and Circle to Search: searches made with an image, from Google Lens, Circle to Search on Android and image uploads in Google Search. Web search totals do not include them.',
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
  multimodal:
    'these are pages people reached by searching with a photo or a screenshot, often of a product. Ask the person whether those visits matter to them before suggesting work.',
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

// Google's brand classification of queries (brandedClassification).
export const BRAND_CLASSES = ['branded', 'non_branded'] as const
export type BrandClass = (typeof BRAND_CLASSES)[number]

// The first day Google classifies queries as brand or not.
export const BRAND_DATA_FROM = '2026-02-21'

export const DEVICES = ['desktop', 'mobile', 'tablet'] as const
export type Device = (typeof DEVICES)[number]

// Orders for Search Console rows. Search Console itself returns rows by
// clicks only, so every other order sorts the rows fetched.
export const SORTS = [
  'clicks',
  'impressions',
  'ctr',
  'ctr_low',
  'position',
  'clicks_gain',
  'clicks_loss',
  'impressions_gain',
  'impressions_loss',
] as const

export type Sort = (typeof SORTS)[number]

// Each order as the value that puts a row first, highest first.
const SORT_VALUE: Record<Sort, (row: Row) => number> = {
  clicks: (row) => Number(row.clicks ?? 0),
  impressions: (row) => Number(row.impressions ?? 0),
  ctr: (row) => Number(row.ctr ?? 0),
  ctr_low: (row) => -Number(row.ctr ?? 0),
  // Best (lowest) position first; rows with no position go last.
  position: (row) =>
    row.position === null || row.position === undefined
      ? Number.NEGATIVE_INFINITY
      : -Number(row.position),
  clicks_gain: (row) => Number(row.clicks_change ?? 0),
  clicks_loss: (row) => -Number(row.clicks_change ?? 0),
  impressions_gain: (row) => Number(row.impressions_change ?? 0),
  impressions_loss: (row) => -Number(row.impressions_change ?? 0),
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
      'search_console only. web (default) is the All tab; image, video and news are the Images, Videos and News tabs; discover is the Discover feed; google_news is the Google News app and site; multimodal is Google Lens, Circle to Search and image uploads. discover and google_news have pages but no queries or positions.',
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
  sort: z
    .enum(SORTS)
    .optional()
    .describe(
      'search_console only. Row order: clicks (default; date order when grouped by date), impressions, ctr (highest first), ctr_low (lowest first; pair with min_impressions), position (best first), or clicks_gain, clicks_loss, impressions_gain, impressions_loss against the previous period.',
    ),
  brand: z
    .enum(BRAND_CLASSES)
    .optional()
    .describe(
      "search_console only: Google's own brand split, branded or non_branded. Google classifies only top-level properties with enough searches, from 2026-02-21, and not with query, query_regex or exclude_query_regex.",
    ),
  country: z
    .array(z.string().regex(/^[A-Za-z]{3}$/))
    .min(1)
    .max(50)
    .optional()
    .describe(
      'search_console only: three-letter country codes, such as fra, bel and che, for rows from any of them.',
    ),
  device: z
    .array(z.enum(DEVICES))
    .min(1)
    .max(3)
    .optional()
    .describe('search_console only: desktop, mobile or tablet, one or more.'),
  min_impressions: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'search_console only: leave out rows with fewer impressions in the current period, so ctr and position sorts skip rows seen once or twice.',
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
// The seo_data arguments that rebuild these filters: rowTextFilters in
// reverse.
const FILTER_ARGS: Record<string, string> = {
  'page contains': 'page',
  'query contains': 'query',
  'page includingRegex': 'page_regex',
  'query includingRegex': 'query_regex',
  'query excludingRegex': 'exclude_query_regex',
}

function filterArgs(filters: RowFilter[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (const filter of filters) {
    const name = FILTER_ARGS[`${filter.dimension} ${filter.operator}`]
    if (name) args[name] = filter.expression
  }
  return args
}

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
  sort?: Sort
  minImpressions?: number
  brand?: BrandClass
  countries?: string[]
  devices?: Device[]
}

// Most Search Console rows read per period.
const ROWS = 25_000

// Google classifies brand searches only for top-level properties, so a
// property for one folder, such as https://example.com/blog/, gets none.
export function isFolderProperty(site: string): boolean {
  if (site.startsWith('sc-domain:')) return false
  try {
    return new URL(site).pathname.replace(/\/+$/, '') !== ''
  } catch {
    return false
  }
}

// What a brand split needs to be read right, beside the rows.
export const BRAND_SPLIT_NOTE = `Google classifies brand searches only for top-level properties with enough searches, and only from ${BRAND_DATA_FROM}. A property it does not classify gets no rows, which means unclassified, not zero brand searches.`

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
  const brandSplit =
    input.brand !== undefined || dimensions.includes('brandedClassification')
  // A query cut of Discover can only come back empty, which would look like
  // a real zero.
  if (
    NO_QUERIES.has(searchType) &&
    (dimensions.includes('query') ||
      brandSplit ||
      filters.some((filter) => filter.dimension === 'query'))
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${surface} has no queries in Search Console, only pages. Ask for dimensions page, date, country, device or searchAppearance, without query filters or a brand split.`,
    )
  }
  if (brandSplit && filters.some((filter) => filter.dimension === 'query')) {
    throw new SeoError(
      'INVALID_INPUT',
      'Google does not split brand searches in a request that also filters queries. Leave out query, query_regex and exclude_query_regex, or drop brand and leave out the brand names with exclude_query_regex.',
    )
  }
  if (brandSplit && isFolderProperty(input.site)) {
    throw new SeoError(
      'INVALID_INPUT',
      `Google classifies brand searches only for top-level properties, not a folder such as ${input.site}. Leave out the brand names with exclude_query_regex instead, or ask for the top-level property.`,
    )
  }
  const lists = [
    ...(input.countries?.length
      ? [
          {
            dimension: 'country' as const,
            expressions: [
              ...new Set(input.countries.map((code) => code.toUpperCase())),
            ],
          },
        ]
      : []),
    ...(input.devices?.length
      ? [
          {
            dimension: 'device' as const,
            expressions: [
              ...new Set(input.devices.map((device) => device.toUpperCase())),
            ],
          },
        ]
      : []),
  ]
  const allFilters: RowFilter[] = [
    ...filters,
    ...(input.brand
      ? [
          {
            dimension: 'brandedClassification' as const,
            operator: 'equals' as const,
            expression: input.brand.toUpperCase(),
          },
        ]
      : []),
  ]
  if (noQueries && input.sort === 'position') {
    throw new SeoError(
      'INVALID_INPUT',
      `${surface} has no positions in Search Console. Sort by clicks, impressions, ctr or a gain or loss instead.`,
    )
  }
  const range = dateWindow(input, 28)
  const previous = earlierRange(range)
  const query: Omit<SearchAnalyticsRequest, 'startDate' | 'endDate'> = {
    dimensions,
    type: SEARCH_TYPES[searchType],
    maxRows: ROWS,
    ...(allFilters.length || lists.length
      ? {
          dimensionFilterGroups: [
            {
              groupType: 'and' as const,
              filters: allFilters,
              ...(lists.length ? { filterLists: lists } : {}),
            },
          ],
        }
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
      previous_impressions: old?.impressions ?? 0,
      impressions_change: row.impressions - (old?.impressions ?? 0),
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
        previous_impressions: old.impressions,
        impressions_change: -old.impressions,
        ...before_(old.position),
      })
    }
  }
  const minImpressions = input.minImpressions
  const kept = minImpressions
    ? rows.filter((row) => Number(row.impressions ?? 0) >= minImpressions)
    : rows
  // The asked order, then most clicks, then most impressions, so surfaces
  // with few clicks such as image search still sort by size; keys break
  // the last ties. Grouped by date with no order asked, rows stay in date
  // order.
  const sort = input.sort
  const keysOf = (row: Row) => dimensions.map((d) => String(row[d])).join(' ')
  kept.sort((a, b) =>
    dateAt >= 0 && !sort
      ? String(a.date).localeCompare(String(b.date))
      : (sort ? SORT_VALUE[sort](b) - SORT_VALUE[sort](a) : 0) ||
        Number(b.clicks ?? 0) - Number(a.clicks ?? 0) ||
        Number(b.impressions ?? 0) - Number(a.impressions ?? 0) ||
        keysOf(a).localeCompare(keysOf(b)),
  )
  const notes: string[] = []
  if (minImpressions) {
    notes.push(
      `${rows.length - kept.length} of ${rows.length} rows had fewer than ${minImpressions} impressions and are left out.`,
    )
  }
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
      `Totals: clicks ${sum('clicks')}, impressions ${sum('impressions')}; previous period clicks ${sum('previous_clicks')}, impressions ${sum('previous_impressions')}.`,
    )
  }
  notes.push(
    `Compared with ${previous.startDate} to ${previous.endDate}${before.rowsFetched >= ROWS ? ' (earlier period hit the row limit)' : ''}. ${noQueries ? '0 clicks and 0 impressions' : '0 clicks with no position'} means the row had no impressions in the current period.`,
  )
  const surfaceNote = SURFACE_NOTES[searchType]
  if (surfaceNote) notes.push(surfaceNote)
  if (brandSplit) {
    notes.push(
      previous.startDate < BRAND_DATA_FROM
        ? `${BRAND_SPLIT_NOTE} These dates reach back before ${BRAND_DATA_FROM}, so those days are missing, not zero.`
        : BRAND_SPLIT_NOTE,
    )
  }
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
      `Search Console has more than ${ROWS} rows; add a filter to narrow it.${sort && sort !== 'clicks' ? ` It returns rows by clicks, so the rows left out are those with the fewest clicks, often ones with impressions but no clicks; this ${sort} order covers only the ${ROWS} rows read, not the whole site.` : ''}`,
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
      title: `Search Console ${input.site}, ${range.startDate} to ${range.endDate}, ${surface}, by ${dimensions.join(' and ')}${sort ? `, sorted by ${sort}` : ''}.`,
      rows: kept,
      offset: input.offset ?? 0,
      limit: PAGE_SIZE,
      detail,
      notes,
      origin: originOf(input.site),
      // The next page keeps this call's filters and dates, so it continues
      // the same list instead of starting an unfiltered one.
      more: (offset) =>
        deps.call('data', {
          site: input.site,
          dimensions: dimensions.join(','),
          ...(searchType === 'web' ? {} : { search_type: searchType }),
          ...filterArgs(filters),
          brand: input.brand,
          country: input.countries?.join(','),
          device: input.devices?.join(','),
          sort,
          min_impressions: minImpressions,
          start_date: range.startDate,
          end_date: range.endDate,
          detail: 'rows',
          offset,
        }),
    })}\n\n${FACTS_ONLY}`,
    data: {
      range,
      comparisonRange: previous,
      searchType,
      ...(input.brand ? { brand: input.brand } : {}),
      ...(input.countries?.length ? { countries: input.countries } : {}),
      ...(input.devices?.length ? { devices: input.devices } : {}),
      total: kept.length,
      offset: input.offset ?? 0,
      rows: kept.slice(input.offset ?? 0, (input.offset ?? 0) + PAGE_SIZE),
    },
  }
}
