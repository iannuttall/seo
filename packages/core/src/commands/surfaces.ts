import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { SEARCH_TYPE_NAMES, SEARCH_TYPES, type SearchType } from './rows.js'
import type { Caller, DateRange } from './types.js'

// Share of web search impressions at which another surface is raised.
const RAISE_SHARE = 0.1

const count = (value: number) => Math.round(value).toLocaleString('en-US')

// The question the agent puts to the person, with their numbers.
const SURFACE_QUESTION: Partial<
  Record<SearchType, (impressions: number, clicks: number) => string>
> = {
  image: (i, c) =>
    `Google Images showed your pages ${count(i)} times in these dates and sent ${count(c)} clicks. Do visits from image search matter to you? I can look at the pages behind them.`,
  video: (i, c) =>
    `Google's Videos tab showed your pages ${count(i)} times and sent ${count(c)} clicks. Does video matter to you? I can look at the pages behind them.`,
  news: (i, c) =>
    `Google's News tab showed your pages ${count(i)} times and sent ${count(c)} clicks. Do you publish news? I can look at the pages behind them.`,
  discover: (i, c) =>
    `Google Discover showed your pages ${count(i)} times and sent ${count(c)} clicks. Does Discover matter to you? I can look at the pages behind them.`,
  google_news: (i, c) =>
    `Google News showed your pages ${count(i)} times and sent ${count(c)} clicks. Do you publish news? I can look at the pages behind them.`,
}

// Google's other surfaces for the overview's dates, each its own count, and
// a call for the pages behind the biggest. A failed read is named and
// never stops the report.
export async function surfacesLine(
  read: SearchAnalyticsQuery,
  site: string,
  overview: Record<string, unknown>,
  call: Caller,
): Promise<{ text: string; data: Record<string, unknown>[] }> {
  const range = overview.range as DateRange
  const before = overview.comparisonRange as DateRange
  const web = overview.summary as { clicks: number; impressions: number }
  const types = (Object.keys(SEARCH_TYPES) as SearchType[]).filter(
    (type) => type !== 'web',
  )
  const total = async (type: SearchType, window: DateRange) =>
    (
      await read(site, {
        ...window,
        dimensions: [],
        type: SEARCH_TYPES[type],
        dataState: 'final',
        maxRows: 1,
      })
    ).rows[0] ?? { clicks: 0, impressions: 0 }
  type Surface =
    | {
        surface: SearchType
        clicks: number
        previousClicks: number
        impressions: number
        previousImpressions: number
      }
    | { surface: SearchType; error: string }
  const data = await Promise.all(
    types.map(async (type): Promise<Surface> => {
      try {
        const [now, then] = await Promise.all([
          total(type, range),
          total(type, before),
        ])
        return {
          surface: type,
          clicks: now.clicks,
          previousClicks: then.clicks,
          impressions: now.impressions,
          previousImpressions: then.impressions,
        }
      } catch (error) {
        return {
          surface: type,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )
  const parts = data.map((row) => {
    const name = SEARCH_TYPE_NAMES[row.surface]
    if ('error' in row) return `${name}: could not be read (${row.error})`
    if (!row.impressions && !row.previousImpressions) {
      return `${name}: no impressions recorded${row.surface === 'discover' ? ' (Search Console reports Discover only above a minimum number of impressions)' : ''}`
    }
    return `${name}: clicks ${row.clicks} (was ${row.previousClicks}), impressions ${row.impressions} (was ${row.previousImpressions})`
  })
  const shown = data
    .flatMap((row) =>
      'impressions' in row && row.impressions > 0 ? [row] : [],
    )
    .sort(
      (a, b) =>
        b.impressions - a.impressions || a.surface.localeCompare(b.surface),
    )
  const lines = [
    `Other Google surfaces, same dates, each counted apart from web search: ${parts.join('; ')}.`,
  ]
  // A surface is raised only when it is a real share of the site's
  // impressions; below that it is numbers only.
  const top = shown[0]
  if (
    top &&
    web.impressions > 0 &&
    top.impressions >= web.impressions * RAISE_SHARE
  ) {
    const share = (part: number, whole: number) => {
      if (whole <= 0) return 'n/a'
      const percent = (part / whole) * 100
      return part > 0 && percent < 1 ? 'under 1%' : `${Math.round(percent)}%`
    }
    const name = SEARCH_TYPE_NAMES[top.surface]
    lines.push(
      `${name[0]?.toUpperCase()}${name.slice(1)} has ${share(top.impressions, web.impressions)} as many impressions as web search and ${share(top.clicks, web.clicks)} as many clicks. Ask the person, in your words: "${SURFACE_QUESTION[top.surface]?.(top.impressions, top.clicks)}" If yes: ${top.surface === 'image' ? call('report', { site, section: 'image-search' }) : call('data', { site, search_type: top.surface, dimensions: 'page' })}.`,
    )
  }
  return { text: lines.join(' '), data }
}
