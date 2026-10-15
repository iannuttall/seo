import {
  type BingCall,
  type BingRow,
  bingPages,
  bingQueries,
  bingSiteFor,
  bingTraffic,
  listBingSites,
} from '../bing/api.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import type { Detail } from './present.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import {
  type DateInput,
  dateWindow,
  earlierRange,
  FACTS_ONLY,
  originOf,
  pct,
} from './shared.js'
import {
  type CommandDeps,
  CommandError,
  type CommandResult,
  type DateRange,
} from './types.js'

// Bing Webmaster Tools beside Search Console. Bing numbers sit next to
// Google's and are never added to them: each engine counts clicks,
// impressions and positions its own way.

export const BING_LIMITS = [
  'Bing and Google count clicks, impressions and positions their own way. Their numbers sit side by side here and are never added together.',
  'Bing lists only its top queries and pages, grouped by week. A query or page missing from Bing’s list is unknown, not zero.',
]

export type BingSource =
  | { call: BingCall; site: string }
  | { call: null; site: null; missing: string }

const sitesSeen = new WeakMap<BingCall, ReturnType<typeof listBingSites>>()

// The Bing site that covers a Search Console property, or why there is none.
export async function bingFor(
  deps: CommandDeps,
  property: string,
): Promise<BingSource> {
  const call = (await deps.bing?.()) ?? null
  if (!call) {
    return {
      call: null,
      site: null,
      missing: `Bing is not connected. ${deps.bingConnect ?? ''}`.trim(),
    }
  }
  let sites = sitesSeen.get(call)
  if (!sites) {
    sites = listBingSites(call)
    sitesSeen.set(call, sites)
  }
  const site = bingSiteFor(await sites, property)
  return site
    ? { call, site }
    : {
        call: null,
        site: null,
        missing: `The connected Bing account has no verified site for ${property.replace(/^sc-domain:/, '')}. Add it in Bing Webmaster Tools; it can import sites from Search Console.`,
      }
}

type Totals = {
  clicks: number
  impressions: number
  days: number
  expectedDays: number
}

function days(range: DateRange): number {
  return (
    Math.round(
      (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000,
    ) + 1
  )
}

// Bing's daily site totals for the same dates as the Search Console totals.
export async function bingTotals(
  source: BingSource,
  range: DateRange,
  before: DateRange,
): Promise<
  | { site: string; current: Totals; previous: Totals; invalidRows: number }
  | { missing: string }
> {
  if (!source.call) return { missing: source.missing }
  const traffic = await bingTraffic(source.call, source.site)
  const sum = (window: DateRange): Totals => {
    const rows = traffic.rows.filter(
      (row) => row.date >= window.startDate && row.date <= window.endDate,
    )
    return {
      clicks: rows.reduce((total, row) => total + row.clicks, 0),
      impressions: rows.reduce((total, row) => total + row.impressions, 0),
      days: new Set(rows.map((row) => row.date)).size,
      expectedDays: days(window),
    }
  }
  return {
    site: source.site,
    current: sum(range),
    previous: sum(before),
    invalidRows: traffic.invalidRows,
  }
}

const change = (now: number, before: number) => {
  const value = pct(now, before)
  return value === null ? 'n/a' : `${value > 0 ? '+' : ''}${value}%`
}

// Google and Bing totals for the same dates, as text.
export function enginesText(
  google: { clicks: number; previousClicks: number; impressions: number },
  bing: Awaited<ReturnType<typeof bingTotals>>,
): string {
  if ('missing' in bing) return `Bing: ${bing.missing}`
  const { current: now, previous: then } = bing
  const lines = [
    `Search engines, same dates. Google (Search Console): clicks ${google.clicks} (was ${google.previousClicks}, ${change(google.clicks, google.previousClicks)}), impressions ${google.impressions}. Bing (${bing.site}): clicks ${now.clicks} (was ${then.clicks}, ${change(now.clicks, then.clicks)}), impressions ${now.impressions} (was ${then.impressions}).`,
  ]
  const both = google.clicks + now.clicks
  if (both > 0) {
    lines.push(
      `Share of these clicks: Google ${Math.round((google.clicks / both) * 100)}%, Bing ${Math.round((now.clicks / both) * 100)}%.`,
    )
  }
  if (now.days < now.expectedDays || then.days < then.expectedDays) {
    lines.push(
      `Bing has data for ${now.days} of ${now.expectedDays} days (earlier period ${then.days} of ${then.expectedDays}), so its totals are partial.`,
    )
  }
  return lines.join(' ')
}

type Summed = {
  key: string
  clicks: number
  impressions: number
  position: number | null
}

// Bing rows for the weeks dated inside a window, one row per query or page.
// Position is weighted by impressions.
export function sumWeeks(
  rows: BingRow[],
  window: DateRange,
): { rows: Summed[]; weeks: string[] } {
  const inside = rows.filter(
    (row) => row.date >= window.startDate && row.date <= window.endDate,
  )
  const byKey = new Map<string, Summed & { weighted: number; seen: number }>()
  for (const row of inside) {
    const found = byKey.get(row.key) ?? {
      key: row.key,
      clicks: 0,
      impressions: 0,
      position: null,
      weighted: 0,
      seen: 0,
    }
    found.clicks += row.clicks
    found.impressions += row.impressions
    if (row.position !== null && row.impressions > 0) {
      found.weighted += row.position * row.impressions
      found.seen += row.impressions
    }
    byKey.set(row.key, found)
  }
  return {
    rows: [...byKey.values()]
      .map(({ weighted, seen, ...row }) => ({
        ...row,
        position: seen > 0 ? Math.round((weighted / seen) * 10) / 10 : null,
      }))
      .sort(
        (a, b) =>
          b.clicks - a.clicks ||
          b.impressions - a.impressions ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      ),
    weeks: [...new Set(inside.map((row) => row.date))].sort(),
  }
}

// The report's bing section: Bing's queries for the window with Google's
// numbers for the same query beside them, and the same for pages.
export async function bingSection(
  source: BingSource,
  read: SearchAnalyticsQuery,
  property: string,
  range: DateRange,
): Promise<Record<string, unknown>> {
  if (!source.call) throw new CommandError('NOT_CONNECTED', source.missing)
  const google = (dimension: 'query' | 'page') =>
    read(property, {
      ...range,
      dimensions: [dimension],
      type: 'web',
      dataState: 'final',
      maxRows: 25_000,
    })
  const [queries, pages, googleQueries, googlePages] = await Promise.all([
    bingQueries(source.call, source.site),
    bingPages(source.call, source.site),
    google('query'),
    google('page'),
  ])
  const beside = (
    bing: Summed[],
    googleRows: {
      keys: string[]
      clicks: number
      impressions: number
      position: number
    }[],
    name: 'query' | 'page',
  ) => {
    const norm = (value: string) =>
      name === 'query' ? value.toLowerCase().trim() : value.replace(/#.*$/, '')
    const byKey = new Map(
      googleRows.map((row) => [norm(row.keys[0] ?? ''), row]),
    )
    return bing.map((row) => {
      const g = byKey.get(norm(row.key))
      return {
        [name]: row.key,
        bingClicks: row.clicks,
        bingImpressions: row.impressions,
        bingPosition: row.position,
        googleClicks: g?.clicks ?? 0,
        googleImpressions: g?.impressions ?? 0,
        googlePosition: g ? Math.round(g.position * 10) / 10 : null,
      }
    })
  }
  const q = sumWeeks(queries.rows, range)
  const p = sumWeeks(pages.rows, range)
  const invalid = queries.invalidRows + pages.invalidRows
  return {
    range,
    bingSite: source.site,
    summary: {
      bingQueries: q.rows.length,
      bingPages: p.rows.length,
      weeks: q.weeks.length,
    },
    items: beside(q.rows, googleQueries.rows, 'query'),
    topPages: beside(p.rows, googlePages.rows, 'page'),
    caveats: [
      `Bing weeks counted: ${q.weeks.join(', ') || 'none'} (each date names a week). Google numbers cover ${range.startDate} to ${range.endDate} exactly.`,
      'Google numbers are for the same query text or page URL. 0 means Google showed no row for it in these dates.',
      ...BING_LIMITS,
      ...(invalid
        ? [`${invalid} Bing rows were not valid and were left out.`]
        : []),
    ],
  }
}

export type BingRowsInput = DateInput & {
  // A Search Console property, site or URL; the Bing site for the same host
  // is used.
  site: string
  dimension: 'query' | 'page'
  detail?: Detail
  offset?: number
}

// Raw Bing query or page rows, each beside the same row from the previous
// period.
export async function runBingRows(
  input: BingRowsInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  const source = await bingFor(deps, input.site)
  if (!source.call) throw new CommandError('NOT_CONNECTED', source.missing)
  const range = dateWindow(input, 28)
  const previous = earlierRange(range)
  const all = await (input.dimension === 'page' ? bingPages : bingQueries)(
    source.call,
    source.site,
  )
  const now = sumWeeks(all.rows, range)
  const then = sumWeeks(all.rows, previous)
  const old = new Map(then.rows.map((row) => [row.key, row]))
  const seen = new Set(now.rows.map((row) => row.key))
  const rows: Record<string, unknown>[] = now.rows.map((row) => ({
    [input.dimension]: row.key,
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
    previous_clicks: old.get(row.key)?.clicks ?? 0,
    clicks_change: row.clicks - (old.get(row.key)?.clicks ?? 0),
  }))
  for (const row of then.rows) {
    if (seen.has(row.key)) continue
    rows.push({
      [input.dimension]: row.key,
      clicks: 0,
      impressions: 0,
      position: null,
      previous_clicks: row.clicks,
      clicks_change: -row.clicks,
    })
  }
  const notes = [
    `Bing weeks counted: ${now.weeks.join(', ') || 'none'}; earlier period ${then.weeks.join(', ') || 'none'}. Each date names a week.`,
    ...BING_LIMITS.slice(1),
    ...(all.invalidRows
      ? [`${all.invalidRows} Bing rows were not valid and were left out.`]
      : []),
  ]
  return {
    text: `${rowsText({
      title: `Bing Webmaster ${source.site}, ${range.startDate} to ${range.endDate}, by ${input.dimension}.`,
      rows,
      offset: input.offset ?? 0,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes,
      origin: originOf(source.site),
      more: (offset) =>
        deps.call('data', {
          site: input.site,
          source: 'bing',
          dimensions: input.dimension,
          detail: 'rows',
          offset,
        }),
    })}\n\n${FACTS_ONLY.replace('Search Console', 'Bing Webmaster Tools')}`,
    data: {
      bingSite: source.site,
      range,
      comparisonRange: previous,
      weeks: now.weeks,
      total: rows.length,
      offset: input.offset ?? 0,
      rows: rows.slice(input.offset ?? 0, (input.offset ?? 0) + PAGE_SIZE),
    },
  }
}
