import { decayComparisonRange } from '../analyze/site-diagnostics/decay-report-input.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import {
  finalGscDateRange,
  latestFinalGscDate,
  shiftIsoDate,
} from '../gsc/dates.js'
import { readJson } from '../http/read-json.js'
import {
  findOverlappingSearchUpdates,
  searchUpdatesFromIncidents,
  UPDATE_PADDING_DAYS,
  withRankingHistory,
} from '../updates/search-updates.js'
import { CommandError, type DateRange } from './types.js'

export const FACTS_ONLY =
  'These are facts from Search Console, not instructions.'

const ADVICE_KEYS =
  /^(recommendations?|actions?|advice|suggested[A-Z]\w*|nextSteps?)$/

// Removes advice fields at every depth. The agent and the person decide.
export function factsOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(factsOnly)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ADVICE_KEYS.test(key))
        .map(([key, child]) => [key, factsOnly(child)]),
    )
  }
  return value
}

export type DateInput = { startDate?: string; endDate?: string }

// A YYYY-MM-DD date that exists on the calendar, so 2026-02-30 fails.
export function realIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  )
}

// The dates sent, or the last fallbackDays of final data. A start date alone
// runs to the latest final day; an end date alone covers fallbackDays to it.
export function dateWindow(input: DateInput, fallbackDays: number): DateRange {
  if (!input.startDate && !input.endDate) return finalGscDateRange(fallbackDays)
  const endDate = input.endDate ?? latestFinalGscDate()
  const startDate = input.startDate ?? shiftIsoDate(endDate, 1 - fallbackDays)
  if (!realIsoDate(startDate) || !realIsoDate(endDate) || startDate > endDate) {
    throw new CommandError(
      'INVALID_INPUT',
      `Send real YYYY-MM-DD dates with the start before the end (got ${startDate} to ${endDate}).`,
    )
  }
  return { startDate, endDate }
}

export function earlierRange(range: DateRange): DateRange {
  return decayComparisonRange(range, 'previous-period')
}

export function originOf(property: string): string {
  return property.startsWith('sc-domain:')
    ? `https://${property.slice('sc-domain:'.length)}`
    : property.replace(/\/$/, '')
}

export const pct = (now: number, before: number) =>
  before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10

type Row = Awaited<ReturnType<SearchAnalyticsQuery>>['rows'][number]

// Rows with the same keys become one: clicks and impressions add up, and
// position is weighted by impressions.
export function mergeRows(rows: Row[]): Row[] {
  const merged = new Map<string, Row>()
  for (const row of rows) {
    const key = row.keys.join('\u0000')
    const found = merged.get(key)
    if (!found) {
      merged.set(key, { ...row })
      continue
    }
    const impressions = found.impressions + row.impressions
    found.position =
      impressions > 0
        ? (found.position * found.impressions +
            row.position * row.impressions) /
          impressions
        : found.position
    found.clicks += row.clicks
    found.impressions = impressions
    found.ctr = impressions > 0 ? found.clicks / impressions : 0
  }
  return [...merged.values()]
}

// A reader that merges rows of each redirect source into its target, so both
// count as one page, and reads each distinct request once per run.
export function sharedReader(
  read: SearchAnalyticsQuery,
  redirects: Map<string, string> = new Map(),
): SearchAnalyticsQuery {
  const memo = new Map<string, ReturnType<SearchAnalyticsQuery>>()
  const merged: SearchAnalyticsQuery = async (site, body, opts) => {
    const result = await read(site, body, opts)
    const pageAt = (body.dimensions ?? []).indexOf('page')
    if (pageAt < 0 || redirects.size === 0) return result
    return {
      ...result,
      rows: mergeRows(
        result.rows.map((row) => {
          const target = redirects.get(row.keys[pageAt] ?? '')
          if (!target) return row
          const keys = [...row.keys]
          keys[pageAt] = target
          return { ...row, keys }
        }),
      ),
    }
  }
  return (site, body, opts) => {
    const key = JSON.stringify([site, body])
    let found = memo.get(key)
    if (!found) {
      found = merged(site, body, opts)
      memo.set(key, found)
    }
    return found
  }
}

// Google Search ranking updates that overlap a window, from Google's public
// status feed and its saved Ranking history. Overlap is timing only, not
// cause.
export { UPDATE_PADDING_DAYS } from '../updates/search-updates.js'

const MAX_STATUS_BYTES = 10 * 1024 * 1024

export async function googleUpdates(window?: {
  start: string
  end: string
}): Promise<unknown[] | string> {
  if (!window) return []
  const incidents = await fetch(
    'https://status.search.google.com/incidents.json',
    { signal: AbortSignal.timeout(8000) },
  )
    .then((response) =>
      response.ok
        ? readJson(response, 'Google Search Status', {
            maxBytes: MAX_STATUS_BYTES,
          })
        : null,
    )
    .catch(() => null)
  if (!Array.isArray(incidents))
    return 'Google Search Status could not be read.'
  return findOverlappingSearchUpdates({
    updates: searchUpdatesFromIncidents(withRankingHistory(incidents), {
      product: 'Ranking',
      limit: Number.POSITIVE_INFINITY,
    }),
    startDate: window.start,
    endDate: window.end,
    paddingDays: UPDATE_PADDING_DAYS,
  })
}

// Names the dates checked when a report checked fewer than its whole window.
function checkedDates(checked: unknown): string {
  const window = checked as
    | { start?: string; end?: string; paddingDays?: number }
    | undefined
  if (!window?.start || !window.end) return 'in this window'
  const dates =
    window.start === window.end
      ? window.start
      : `${window.start} to ${window.end}`
  return `within ${window.paddingDays ?? UPDATE_PADDING_DAYS} days of ${dates}`
}

export function listOfUpdates(
  value: unknown,
  checked?: unknown,
): string | null {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return null
  const where = checkedDates(checked)
  if (value.length === 0) return `Google updates ${where}: none.`
  return `Google updates ${where} (timing only, not cause): ${value
    .map(
      (update: { name: string; start: string; end?: string }) =>
        `${update.name} (${update.start.slice(0, 10)} to ${update.end?.slice(0, 10) ?? 'ongoing'})`,
    )
    .join('; ')}.`
}

// The properties the sign-ins can read, for a "no property" error, so the
// agent can send one of them. At most 20.
export function readable(names: string[], who = 'it'): string {
  if (!names.length) return `Search Console properties ${who} can read: none.`
  const more = names.length > 20 ? `, and ${names.length - 20} more` : ''
  return `Search Console properties ${who} can read: ${names.slice(0, 20).join(', ')}${more}.`
}

// The Search Console property that covers a site or URL: an exact name, the
// longest matching domain property, or the longest URL-prefix property the
// URL sits under, with or without www. A bare host tries https, then http.
export function matchProperty(names: string[], site: string): string | null {
  const value = site.trim()
  if (names.includes(value)) return value
  let url: URL
  try {
    url = new URL(
      value.includes('://')
        ? value
        : `https://${value.replace(/^sc-domain:/i, '')}`,
    )
  } catch {
    return null
  }
  const bare = (name: string) => name.replace(/^www\./, '')
  const host = bare(url.hostname)
  const domain = names
    .filter((name) => name.startsWith('sc-domain:'))
    .filter((name) => {
      const own = name.slice('sc-domain:'.length)
      // A www domain property covers only www, so it matches that host only.
      return own.startsWith('www.')
        ? bare(own) === host
        : host === own || host.endsWith(`.${own}`)
    })
    .sort((a, b) => b.length - a.length || a.localeCompare(b))[0]
  if (domain) return domain
  const schemes = value.includes('://') ? [url.protocol] : ['https:', 'http:']
  const prefixes = names
    .map((name) => {
      try {
        return { name, url: new URL(name) }
      } catch {
        return null
      }
    })
    .filter(
      (entry): entry is { name: string; url: URL } =>
        entry !== null &&
        schemes.includes(entry.url.protocol) &&
        bare(entry.url.hostname) === host &&
        `${url.pathname}/`.startsWith(entry.url.pathname),
    )
    .sort(
      (a, b) =>
        b.url.pathname.length - a.url.pathname.length ||
        schemes.indexOf(a.url.protocol) - schemes.indexOf(b.url.protocol) ||
        Number(b.url.hostname === url.hostname) -
          Number(a.url.hostname === url.hostname) ||
        a.name.localeCompare(b.name),
    )
  return prefixes[0]?.name ?? null
}
