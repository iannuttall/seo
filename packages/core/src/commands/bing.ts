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
import { type Detail, table } from './present.js'
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

// Surfaces without Bing (the hosted MCP, until Bing calls go through a
// relay: Bing blocks Cloudflare's network with ThrottleIP) send agents to
// the CLI, as they do for crawls.
// How an agent on the hosted MCP gets the CLI working on a machine with the
// same account: Google, Bing and keys, with no extra setup.
export const CLI_LINK =
  'If you have a shell, link the CLI to the same account once: run `npx -y seo login`, show the person the link it prints, and after they approve it run `npx -y seo login` again. `npx -y seo` commands then use the same Google accounts, Bing and keys.'

export const LOCAL_BING = `Bing blocks the hosted server, so Bing data comes from the CLI on a machine. ${CLI_LINK} Connect Bing on the account page if it is not connected, then run \`npx -y seo report --site <site> --section bing --json\`.`

// The overview line on a surface without Bing: missing Bing data is not
// "no Bing traffic", and some sites get most of their search visits there.
export const NO_BING_HERE =
  'Bing: not included here, so these totals show Google only. Some sites get most of their search visits from Bing; the CLI reads them with the same account: `npx -y seo login` once, then `npx -y seo report --site <site> --section bing --json`.'

const BING_HOME = 'https://www.bing.com/webmasters'

// Bing has the site but no rows for it yet. Not the same as zero traffic.
export const noBingData = (site: string) =>
  `Bing has no data for ${site} yet. Newly added or newly verified sites take a few days to show data in Bing Webmaster Tools.`

export type BingSource =
  | { call: BingCall; site: string }
  | { call: null; site: null; missing: string }

const sitesSeen = new WeakMap<BingCall, ReturnType<typeof listBingSites>>()

// The Bing site that covers a Search Console property, or why there is none.
export async function bingFor(
  deps: CommandDeps,
  property: string,
): Promise<BingSource> {
  if (!deps.bing) return { call: null, site: null, missing: LOCAL_BING }
  const call = await deps.bing()
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
  if (site?.verified) return { call, site: site.url }
  return {
    call: null,
    site: null,
    missing: site
      ? `${site.url} is in the connected Bing account but is not verified, so Bing gives no data for it. Verify it at ${BING_HOME}.`
      : `The connected Bing account does not have ${property.replace(/^sc-domain:/, '')}. Add and verify it at ${BING_HOME} (it can import sites from Search Console). New sites take a few days to show data.`,
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
  if (!traffic.rows.length && !traffic.invalidRows) {
    return { missing: noBingData(source.site) }
  }
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
  // Bing needs only Bing. Without Google the Google columns stay empty and
  // the caveats say why.
  const [queries, pages, googleRead] = await Promise.all([
    bingQueries(source.call, source.site),
    bingPages(source.call, source.site),
    Promise.all([google('query'), google('page')]).catch((error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
    ),
  ])
  const googleError = googleRead instanceof Error ? googleRead : null
  const [googleQueries, googlePages] =
    googleRead instanceof Error ? [] : googleRead
  const beside = (
    bing: Summed[],
    googleRows:
      | {
          keys: string[]
          clicks: number
          impressions: number
          position: number
        }[]
      | undefined,
    name: 'query' | 'page',
  ) => {
    const norm = (value: string) =>
      name === 'query' ? value.toLowerCase().trim() : value.replace(/#.*$/, '')
    const byKey = new Map(
      googleRows?.map((row) => [norm(row.keys[0] ?? ''), row]),
    )
    return bing.map((row) => {
      const g = byKey.get(norm(row.key))
      const known = googleRows ? 0 : null
      return {
        [name]: row.key,
        bingClicks: row.clicks,
        bingImpressions: row.impressions,
        bingPosition: row.position,
        googleClicks: g?.clicks ?? known,
        googleImpressions: g?.impressions ?? known,
        googlePosition: g ? Math.round(g.position * 10) / 10 : null,
      }
    })
  }
  const q = sumWeeks(queries.rows, range)
  const p = sumWeeks(pages.rows, range)
  const invalid = queries.invalidRows + pages.invalidRows
  const empty = !queries.rows.length && !pages.rows.length && !invalid
  return {
    range,
    bingSite: source.site,
    summary: {
      bingQueries: q.rows.length,
      bingPages: p.rows.length,
      weeks: q.weeks.length,
    },
    items: beside(q.rows, googleQueries?.rows, 'query'),
    topPages: beside(p.rows, googlePages?.rows, 'page'),
    caveats: [
      ...(empty ? [noBingData(source.site)] : []),
      ...(googleError
        ? [
            `Search Console was not available, so the Google columns are empty (unknown, not zero): ${googleError.message}`,
          ]
        : []),
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
    ...(all.rows.length || all.invalidRows ? [] : [noBingData(source.site)]),
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

type Moved = Record<string, unknown> & {
  clicks: number
  previousClicks: number | null
  clicksChange: number | null
}

// Bing rows now against the earlier period: the top rows, the rows that
// lost or gained the most clicks, and the rows that left Bing's top list.
// Bing lists only its top rows, so a row missing from one period is
// unknown there, not zero, and has no change.
function moved(
  rows: BingRow[],
  range: DateRange,
  before: DateRange,
  name: 'query' | 'page',
  limit: number,
) {
  const now = sumWeeks(rows, range)
  const then = sumWeeks(rows, before)
  const old = new Map(then.rows.map((row) => [row.key, row]))
  const seen = new Set(now.rows.map((row) => row.key))
  const all: Moved[] = now.rows.map((row) => {
    const earlier = old.get(row.key)
    return {
      [name]: row.key,
      clicks: row.clicks,
      previousClicks: earlier ? earlier.clicks : null,
      clicksChange: earlier ? row.clicks - earlier.clicks : null,
      impressions: row.impressions,
      position: row.position,
    }
  })
  const by = (sign: 1 | -1) =>
    all
      .filter(
        (row): row is Moved & { clicksChange: number } =>
          row.clicksChange !== null && sign * row.clicksChange > 0,
      )
      .sort(
        (a, b) =>
          sign * (b.clicksChange - a.clicksChange) ||
          String(a[name]).localeCompare(String(b[name])),
      )
      .slice(0, limit)
  return {
    top: all.slice(0, limit),
    biggestLosses: by(-1),
    biggestGains: by(1),
    leftTopList: then.rows
      .filter((row) => !seen.has(row.key))
      .slice(0, limit)
      .map((row) => ({ [name]: row.key, previousClicks: row.clicks })),
    weeks: now.weeks,
    previousWeeks: then.weeks,
  }
}

// Bing's own overview: totals against the previous period and the pages and
// queries that moved. For sites where Bing sends more clicks than Google, or
// that have no Search Console property.
export async function bingOverview(
  source: BingSource,
  range: DateRange,
  before: DateRange,
): Promise<Record<string, unknown>> {
  if (!source.call) throw new CommandError('NOT_CONNECTED', source.missing)
  const [totals, queries, pages] = await Promise.all([
    bingTotals(source, range, before),
    bingQueries(source.call, source.site),
    bingPages(source.call, source.site),
  ])
  if ('missing' in totals)
    throw new CommandError('NOT_CONNECTED', totals.missing)
  const { current: now, previous: then } = totals
  const q = moved(queries.rows, range, before, 'query', 15)
  const p = moved(pages.rows, range, before, 'page', 15)
  return {
    bingSite: source.site,
    range,
    comparisonRange: before,
    summary: {
      clicks: now.clicks,
      previousClicks: then.clicks,
      clicksChangePct: pct(now.clicks, then.clicks),
      impressions: now.impressions,
      previousImpressions: then.impressions,
      impressionsChangePct: pct(now.impressions, then.impressions),
      days: now.days,
      previousDays: then.days,
    },
    pages: p,
    queries: q,
    caveats: [
      ...(now.days < now.expectedDays || then.days < then.expectedDays
        ? [
            `Bing has data for ${now.days} of ${now.expectedDays} days (earlier period ${then.days} of ${then.expectedDays}), so its totals are partial.`,
          ]
        : []),
      `Totals are Bing's daily site totals. Page and query rows are Bing's weekly top rows: weeks ${q.weeks.join(', ') || 'none'} against ${q.previousWeeks.join(', ') || 'none'}.`,
      ...BING_LIMITS.slice(1),
    ],
  }
}

// The Bing overview as text.
export function bingOverviewText(
  report: Record<string, unknown>,
  heading: string,
  origin: string,
  rowsPerList: number,
): string {
  const range = report.range as DateRange
  const before = report.comparisonRange as DateRange
  const t = report.summary as {
    clicks: number
    previousClicks: number
    impressions: number
    previousImpressions: number
    days: number
    previousDays: number
  }
  const columns = (name: string) => [
    name,
    'clicks',
    'previousClicks',
    'clicksChange',
    'impressions',
    'position',
  ]
  const part = (title: string, rows: unknown, name: string) => {
    const list = (rows as Record<string, unknown>[] | undefined) ?? []
    return list.length
      ? `${title}:\n${table(list.slice(0, rowsPerList), columns(name), origin)}`
      : ''
  }
  const group = (key: 'pages' | 'queries', name: 'page' | 'query') => {
    const lists = report[key] as Record<string, unknown>
    return [
      part(
        `Biggest Bing ${key === 'pages' ? 'page' : 'query'} click losses`,
        lists.biggestLosses,
        name,
      ),
      part(
        `Biggest Bing ${key === 'pages' ? 'page' : 'query'} click gains`,
        lists.biggestGains,
        name,
      ),
      (lists.leftTopList as unknown[] | undefined)?.length
        ? `Left Bing's top ${key} list (now unknown, not zero): ${(
            lists.leftTopList as Record<string, unknown>[]
          )
            .slice(0, rowsPerList)
            .map((row) => `${row[name]} (had ${row.previousClicks} clicks)`)
            .join(', ')}.`
        : '',
      rowsPerList >= 10 ? part(`Top Bing ${key}`, lists.top, name) : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  return [
    `${heading}, ${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}.`,
    t.days || t.previousDays
      ? `Bing totals: clicks ${t.clicks} (was ${t.previousClicks}, ${change(t.clicks, t.previousClicks)}), impressions ${t.impressions} (was ${t.previousImpressions}, ${change(t.impressions, t.previousImpressions)}).`
      : 'Bing totals: unknown. Bing has no daily data for these dates.',
    group('pages', 'page'),
    group('queries', 'query'),
    `Limits:\n${(report.caveats as string[]).map((line) => `- ${line}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
