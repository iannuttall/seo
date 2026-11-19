import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { type ContextStore, headingLines } from './context.js'
import type { DateRange } from './types.js'

// Market groups: named sets of countries the person saved under
// "## Markets" in the business context, one per line, such as
// "Europe: FRA, BEL, CHE". Each group is one Search Console request with a
// country filter list, so a report can say how Europe moved instead of
// listing every country.

export type Market = { name: string; countries: string[] }

export const MAX_MARKETS = 5

// The groups under "## Markets". A line counts only when every
// comma-separated item after the name is a three-letter country code, so
// prose such as "UK and US" is left alone.
export function marketGroups(text: string): Market[] {
  const found: Market[] = []
  for (const line of headingLines(text, 'markets')) {
    const match = /^(.+?):\s*(.+)$/.exec(line)
    const name = match?.[1]?.replace(/[`*]/g, '').trim()
    const items = (match?.[2] ?? '').split(',').map((item) => item.trim())
    if (!name || !items.length) continue
    if (!items.every((item) => /^[A-Za-z]{3}$/.test(item))) continue
    const countries = [...new Set(items.map((item) => item.toUpperCase()))]
    if (found.some((market) => market.name === name)) continue
    found.push({ name, countries })
  }
  return found.slice(0, MAX_MARKETS)
}

type Totals = { clicks: number; impressions: number }
export type MarketTotals = Market & { current: Totals; previous: Totals }

// Each group's web search totals for two date ranges.
export async function marketTotals(
  read: SearchAnalyticsQuery,
  site: string,
  markets: Market[],
  current: DateRange,
  previous: DateRange,
): Promise<MarketTotals[]> {
  const total = async (market: Market, range: DateRange): Promise<Totals> => {
    const row = (
      await read(site, {
        ...range,
        dimensions: [],
        type: 'web',
        dataState: 'final',
        maxRows: 1,
        dimensionFilterGroups: [
          {
            filters: [],
            filterLists: [
              { dimension: 'country', expressions: market.countries },
            ],
          },
        ],
      })
    ).rows[0]
    return { clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 }
  }
  return Promise.all(
    markets.map(async (market) => {
      const [now, then] = await Promise.all([
        total(market, current),
        total(market, previous),
      ])
      return { ...market, current: now, previous: then }
    }),
  )
}

// The totals for the market groups saved in the site's business context;
// null without groups, or when the context or Search Console could not be
// read, so a report never stops for them.
export async function savedMarketTotals(
  store: ContextStore | undefined,
  read: SearchAnalyticsQuery,
  site: string,
  current: DateRange,
  previous: DateRange,
): Promise<MarketTotals[] | null> {
  const context = store ? await store.read(site).catch(() => null) : null
  const markets = context ? marketGroups(context.text) : []
  if (!markets.length) return null
  return marketTotals(read, site, markets, current, previous).catch(() => null)
}

const count = (n: number) => Math.round(n).toLocaleString('en-US')

function trend(now: number, before: number): string {
  if (before <= 0) return `from ${count(before)}`
  const pct = Math.round(((now - before) / before) * 100)
  return pct === 0
    ? `level with ${count(before)}`
    : `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on ${count(before)}`
}

// One line for every group, the same wherever it shows.
export function marketLine(rows: MarketTotals[]): string | null {
  if (!rows.length) return null
  return `Markets from the business context: ${rows
    .map(
      (row) =>
        `${row.name} (${row.countries.join(', ')}) clicks ${count(row.current.clicks)}, ${trend(row.current.clicks, row.previous.clicks)}; impressions ${count(row.current.impressions)}, ${trend(row.current.impressions, row.previous.impressions)}`,
    )
    .join('. ')}.`
}
