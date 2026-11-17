import type { SearchAnalyticsRequest } from '../gsc/client/types.js'
import { shiftIsoDate } from '../gsc/dates.js'
import type { ConversionPath } from './context.js'
import { type RowFilter, rowTextFilters } from './rows.js'
import { originOf } from './shared.js'
import type { CommandDeps, DateRange } from './types.js'

// The Search Console numbers a progress point keeps (progress.ts): totals
// for the 28 and 90 days to its end date, split by the brand and category
// regexes in the business context, the 13 full weeks before it, the
// conversion pages with Google's index status, and the tracked searches.

// What a point measures, copied from the business context when it is
// saved, so a later point is read the same way.
export type ProgressDefinition = {
  brand_regex?: string
  category_regex?: string
  pages?: ConversionPath[]
  searches?: string[]
  questions?: string[]
  competitors?: Competitor[]
}

export type Competitor = { domain: string; brand?: string[] }

export type Metrics = {
  clicks: number
  impressions: number
  ctr: number
  // null with no impressions: there is no position to average.
  position: number | null
}

export const SEGMENTS = ['all', 'brand', 'non_brand', 'category'] as const
export type Segment = (typeof SEGMENTS)[number]

export type WeekRow = {
  // The Monday the week starts.
  week: string
} & Partial<Record<Segment, { clicks: number; impressions: number }>>

export type Snapshot = {
  periods: ({ days: number } & DateRange & {
      totals: Partial<Record<Segment, Metrics>>
    })[]
  weeks: WeekRow[]
  pages: ({
    page: string
    // The URL read for a single page: the one with the most impressions,
    // which can be on another host of a domain property.
    url: string | null
    urls: number
    index: string | null
  } & Metrics)[]
  // The host the pages were read on: the one Search Console shows most.
  pages_host: string | null
  // The page rows reached PAGE_ROWS, so a section may be missing pages.
  pages_capped: boolean
  searches: ({ query: string } & Metrics)[]
}

// The periods each snapshot totals, in days to its end date.
const PERIODS = [28, 90] as const
export const SNAPSHOT_WEEKS = 13
// Page rows read for the pages; a section path can cover many URLs.
const PAGE_ROWS = 1_000
const INSPECT_AT_ONCE = 5

const r2 = (value: number) => Math.round(value * 100) / 100

// RE2 needs these escaped to match themselves.
const escapeRegex = (value: string) =>
  value.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&')

export const pageLabel = (page: ConversionPath) =>
  page.prefix && page.path !== '/' ? `${page.path}/` : page.path

// Whether a page URL is the path (with or without a trailing slash), or for
// a section path, the path or a page under it, as conversion pages are
// matched elsewhere.
function pageMatches(url: string, page: ConversionPath): boolean {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return false
  }
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/'
  return page.prefix
    ? trimmed === page.path || trimmed.startsWith(`${page.path}/`)
    : trimmed === page.path
}

function pageRegex(pages: ConversionPath[]): string {
  const alternatives = pages.map((page) => {
    const base = page.path === '/' ? '' : escapeRegex(page.path)
    return page.prefix ? `${base}(?:/.*)?` : `${base}/?`
  })
  return `^https?://[^/]+(?:${alternatives.join('|')})(?:[?#].*)?$`
}

function segmentFilters(
  definition: ProgressDefinition,
): Partial<Record<Segment, RowFilter[]>> {
  const brand = definition.brand_regex
  const category = definition.category_regex
  return {
    all: [],
    ...(brand
      ? {
          brand: rowTextFilters({ queryRegex: brand }),
          non_brand: rowTextFilters({ excludeQueryRegex: brand }),
        }
      : {}),
    ...(category
      ? {
          category: rowTextFilters({
            queryRegex: category,
            excludeQueryRegex: brand,
          }),
        }
      : {}),
  }
}

const groups = (filters: RowFilter[]) =>
  filters.length ? { dimensionFilterGroups: [{ filters }] } : {}

const metrics = (rows: Metrics[]): Metrics => {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const weighted = rows.reduce(
    (sum, row) => sum + (row.position ?? 0) * row.impressions,
    0,
  )
  return {
    clicks,
    impressions,
    ctr: impressions ? r2((clicks / impressions) * 100) : 0,
    position: impressions ? r2(weighted / impressions) : null,
  }
}

// The Monday on or before a date.
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return shiftIsoDate(date, -((day + 6) % 7))
}

// The last Sunday on or before a date: the end of the last full week.
export const lastSunday = (date: string) =>
  new Date(`${date}T00:00:00Z`).getUTCDay() === 0
    ? date
    : shiftIsoDate(mondayOf(date), -1)

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

// Clicks and impressions per Monday-to-Sunday week, per segment, from the
// Monday that starts the range to the Sunday that ends it.
export async function readWeeks(
  site: string,
  definition: ProgressDefinition,
  range: DateRange,
  deps: CommandDeps,
): Promise<WeekRow[]> {
  if (range.startDate > range.endDate) return []
  const filters = segmentFilters(definition)
  const segments = (['all', 'brand', 'category'] as const).filter(
    (segment) => filters[segment],
  )
  const weeks = new Map<string, WeekRow>()
  for (
    let week = range.startDate;
    week <= range.endDate;
    week = shiftIsoDate(week, 7)
  ) {
    weeks.set(week, {
      week,
      ...Object.fromEntries(
        segments.map((segment) => [segment, { clicks: 0, impressions: 0 }]),
      ),
    })
  }
  await Promise.all(
    segments.map(async (segment) => {
      const { rows } = await deps.searchAnalytics(site, {
        ...range,
        dimensions: ['date'],
        type: 'web',
        dataState: 'final',
        maxRows: 600,
        ...groups(filters[segment] ?? []),
      })
      for (const row of rows) {
        const day = row.keys[0]
        if (!day) continue
        const total = weeks.get(mondayOf(day))?.[segment]
        if (!total) continue
        total.clicks += row.clicks
        total.impressions += row.impressions
      }
    }),
  )
  return [...weeks.values()]
}

export async function takeSnapshot(
  site: string,
  definition: ProgressDefinition,
  endDate: string,
  deps: CommandDeps,
): Promise<Snapshot> {
  const filters = segmentFilters(definition)
  const read = (body: Partial<SearchAnalyticsRequest> & DateRange) =>
    deps.searchAnalytics(site, {
      type: 'web',
      dataState: 'final',
      ...body,
    })
  const periods = Promise.all(
    PERIODS.map(async (days) => {
      const range = { startDate: shiftIsoDate(endDate, 1 - days), endDate }
      const totals = await Promise.all(
        SEGMENTS.flatMap((segment) => {
          const segmentFilter = filters[segment]
          if (!segmentFilter) return []
          return [
            read({
              ...range,
              dimensions: [],
              maxRows: 1,
              ...groups(segmentFilter),
            }).then(
              ({ rows }) => [segment, metrics(rows.slice(0, 1))] as const,
            ),
          ]
        }),
      )
      return { days, ...range, totals: Object.fromEntries(totals) }
    }),
  )
  const sunday = lastSunday(endDate)
  const weeks = readWeeks(
    site,
    definition,
    {
      startDate: shiftIsoDate(sunday, 1 - SNAPSHOT_WEEKS * 7),
      endDate: sunday,
    },
    deps,
  )
  const range28 = { startDate: shiftIsoDate(endDate, -27), endDate }
  const specs = definition.pages ?? []
  const pages = (async () => {
    if (!specs.length) return { host: null, pages: [], capped: false }
    const { rows } = await read({
      ...range28,
      dimensions: ['page'],
      maxRows: PAGE_ROWS,
      ...groups(rowTextFilters({ pageRegex: pageRegex(specs) })),
    })
    // The host Search Console shows most, for pages it shows no rows for: a
    // domain property's pages often live on www.
    const hosts = new Map<string, number>()
    for (const row of rows) {
      const host = hostOf(row.keys[0] ?? '')
      if (host) hosts.set(host, (hosts.get(host) ?? 0) + row.impressions)
    }
    const host =
      [...hosts].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? new URL(originOf(site)).hostname
    const found = specs.map((spec) => {
      const matched = rows.filter((row) => pageMatches(row.keys[0] ?? '', spec))
      // The URL with the most impressions; a domain property can show the
      // same path on more than one host.
      const top = [...matched].sort(
        (a, b) =>
          b.impressions - a.impressions ||
          String(a.keys[0]).localeCompare(String(b.keys[0])),
      )[0]?.keys[0]
      const url = spec.prefix ? null : (top ?? `https://${host}${spec.path}`)
      return { label: pageLabel(spec), matched, url }
    })
    const index = await inspectPages(site, found, deps)
    return {
      host,
      capped: rows.length >= PAGE_ROWS,
      pages: found.map(({ label, matched, url }) => ({
        page: label,
        url,
        urls: matched.length,
        index: index.get(label) ?? null,
        ...metrics(matched),
      })),
    }
  })()
  const searches = (async () => {
    const list = definition.searches ?? []
    if (!list.length) return []
    const { rows } = await read({
      ...range28,
      dimensions: ['query'],
      maxRows: list.length,
      ...groups(
        rowTextFilters({
          queryRegex: `^(?:${list.map(escapeRegex).join('|')})$`,
        }),
      ),
    })
    return list.map((query) => ({
      query,
      ...metrics(rows.filter((row) => row.keys[0] === query)),
    }))
  })()
  const [p, w, pg, s] = await Promise.all([periods, weeks, pages, searches])
  return {
    periods: p,
    weeks: w,
    pages_host: pg.host,
    pages: pg.pages,
    pages_capped: pg.capped,
    searches: s,
  }
}

// Google's index status for each single page (not section paths), from URL
// Inspection of the URL Search Console shows for the path, else the main
// host and the path. A failed read stays null, not "not indexed".
async function inspectPages(
  site: string,
  pages: { label: string; url: string | null }[],
  deps: CommandDeps,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const single = pages.flatMap(({ label, url }) =>
    url ? [{ label, url }] : [],
  )
  for (let i = 0; i < single.length; i += INSPECT_AT_ONCE) {
    await Promise.all(
      single.slice(i, i + INSPECT_AT_ONCE).map(async ({ label, url }) => {
        try {
          const status = await deps.inspect(site, url)
          const value = status.coverage ?? status.verdict
          if (value) result.set(label, value)
        } catch {
          // Left out: unknown, not a status.
        }
      }),
    )
  }
  return result
}
