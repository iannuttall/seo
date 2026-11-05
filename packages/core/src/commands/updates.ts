import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { latestFinalGscDate, shiftIsoDate } from '../gsc/dates.js'
import type { SearchUpdate } from '../updates/search-updates.js'
import {
  type DateInput,
  originOf,
  rankingUpdates,
  realIsoDate,
  sharedReader,
} from './shared.js'
import {
  type CommandDeps,
  CommandError,
  type CommandResult,
  type DateRange,
} from './types.js'

// The google-updates section of the report: one Google ranking update laid
// over the site's own Search Console data. The update's days against the
// same number of days just before it, in whole weeks so the weekdays line
// up, with the folders, pages and queries that moved most, and how that
// change compares with the site's own movement in the weeks before. Timing
// only: it never says the update caused a change. The hosted server sends
// the same result to audited sites after each update (google-update).

export const UPDATES_SECTION = 'google-updates'

export const UPDATES_SECTION_TEXT =
  'One Google ranking update (core, spam and similar, from Google’s Search Status Dashboard) laid over the site’s Search Console data: clicks and impressions from the day it started against the same number of days just before (whole weeks, up to 28 days), whether that change is outside the site’s own movement in the 8 comparisons before it (a heuristic), and the folders, pages and queries that gained or lost most. The latest update by default; with end_date, the latest update that started on or before it. Timing only, not cause.'

// Bounds, set before any call: days compared, earlier comparisons for the
// normal range, rows read per period and rows listed.
const MAX_DAYS = 28
const BASELINE = 8
const ROWS = 25_000
const LISTED = 10
const SHOWN = 5
// Fewer clicks than this before the update is too little to judge.
const MIN_CLICKS = 50

export type ImpactUpdate = {
  id: string
  name: string
  start: string
  end: string | null
  url: string
}

export type ImpactPeriod = DateRange & { clicks: number; impressions: number }

export type ImpactRow = {
  key: string
  clicks: number
  previous: number
  impressions: number
  previous_impressions: number
}

export type UpdateImpact = {
  update: ImpactUpdate
  site: string
  // full: every day of the update, in whole weeks. partial: final data
  // does not cover all of it yet, or it is still rolling out. waiting:
  // fewer than 7 days of final data since it started, so nothing compared.
  window: 'full' | 'partial' | 'waiting'
  before: ImpactPeriod | null
  after: ImpactPeriod | null
  // The largest change in clicks, as a percentage, in the earlier
  // comparisons of the same length; null when too few could be made.
  normal_range: { comparisons: number; clicks_pct: number } | null
  verdict: 'within-normal' | 'outside-normal' | 'not-enough-data'
  // Rows read hit the limit, so the lists may miss rows.
  capped: { pages: boolean; queries: boolean }
  folders: ImpactRow[]
  pages: { lost: ImpactRow[]; gained: ImpactRow[] }
  queries: { lost: ImpactRow[]; gained: ImpactRow[] }
}

const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1

export const asImpactUpdate = (update: SearchUpdate): ImpactUpdate => ({
  id: update.id,
  name: update.name,
  start: update.start,
  end: update.end ?? null,
  url: update.sourceUrl,
})

type Row = { keys: string[]; clicks: number; impressions: number }

function sum(rows: Row[], from: string, to: string) {
  let clicks = 0
  let impressions = 0
  for (const row of rows) {
    const day = row.keys[0] ?? ''
    if (day < from || day > to) continue
    clicks += row.clicks
    impressions += row.impressions
  }
  return { clicks, impressions }
}

const change = (now: number, before: number) =>
  before > 0 ? ((now - before) / before) * 100 : null

// Rows keyed by the first dimension, before and after side by side.
function joined(before: Row[], after: Row[]): ImpactRow[] {
  const byKey = new Map<string, ImpactRow>()
  const at = (key: string) => {
    let row = byKey.get(key)
    if (!row) {
      row = {
        key,
        clicks: 0,
        previous: 0,
        impressions: 0,
        previous_impressions: 0,
      }
      byKey.set(key, row)
    }
    return row
  }
  for (const row of before) {
    const item = at(row.keys[0] ?? '')
    item.previous += row.clicks
    item.previous_impressions += row.impressions
  }
  for (const row of after) {
    const item = at(row.keys[0] ?? '')
    item.clicks += row.clicks
    item.impressions += row.impressions
  }
  return [...byKey.values()]
}

const moved = (row: ImpactRow) => row.clicks - row.previous
const byKey = (a: ImpactRow, b: ImpactRow) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0

function extremes(rows: ImpactRow[]) {
  return {
    lost: rows
      .filter((row) => moved(row) < 0)
      .sort((a, b) => moved(a) - moved(b) || byKey(a, b))
      .slice(0, LISTED),
    gained: rows
      .filter((row) => moved(row) > 0)
      .sort((a, b) => moved(b) - moved(a) || byKey(a, b))
      .slice(0, LISTED),
  }
}

// The first folder of a page's path, such as /blog/, or / for a page at
// the top level.
function folderOf(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return parts.length > 1 ? `/${parts[0]}/` : '/'
  } catch {
    return '/'
  }
}

function folders(pages: ImpactRow[]): ImpactRow[] {
  const byFolder = new Map<string, ImpactRow>()
  for (const page of pages) {
    const key = folderOf(page.key)
    const row = byFolder.get(key) ?? {
      key,
      clicks: 0,
      previous: 0,
      impressions: 0,
      previous_impressions: 0,
    }
    row.clicks += page.clicks
    row.previous += page.previous
    row.impressions += page.impressions
    row.previous_impressions += page.previous_impressions
    byFolder.set(key, row)
  }
  return [...byFolder.values()]
    .filter((row) => moved(row) !== 0)
    .sort((a, b) => Math.abs(moved(b)) - Math.abs(moved(a)) || byKey(a, b))
    .slice(0, LISTED)
}

// The days compared for an update: whole weeks from its start, up to
// MAX_DAYS, cut to what final data covers; and the length wanted once
// final data covers it all.
function windowDays(update: ImpactUpdate, latest: string) {
  const start = update.start.slice(0, 10)
  const end = update.end?.slice(0, 10) ?? null
  const wanted = Math.min(
    MAX_DAYS,
    Math.max(7, Math.ceil(days(start, end ?? latest) / 7) * 7),
  )
  const covered = Math.floor(Math.max(0, days(start, latest)) / 7) * 7
  return { start, end, wanted, n: Math.min(wanted, covered) }
}

// True once an update has finished and final Search Console data covers
// all the days compared, so a result sent now is the whole update.
export function impactReady(update: ImpactUpdate, now: Date): boolean {
  const { end, wanted, n } = windowDays(update, latestFinalGscDate(now))
  return end !== null && n === wanted
}

// The update over one site. Up to five Search Console calls: daily totals
// for the update and the weeks before it, then pages and queries for the
// two periods compared.
export async function updateImpact(
  site: string,
  update: ImpactUpdate,
  read: SearchAnalyticsQuery,
  now: Date,
): Promise<UpdateImpact> {
  const { start, end, wanted, n } = windowDays(update, latestFinalGscDate(now))
  const empty = {
    update,
    site,
    before: null,
    after: null,
    normal_range: null,
    verdict: 'not-enough-data' as const,
    capped: { pages: false, queries: false },
    folders: [],
    pages: { lost: [], gained: [] },
    queries: { lost: [], gained: [] },
  }
  if (n < 7) return { ...empty, window: 'waiting' }
  const after = { startDate: start, endDate: shiftIsoDate(start, n - 1) }
  const before = {
    startDate: shiftIsoDate(start, -n),
    endDate: shiftIsoDate(start, -1),
  }
  // Earlier comparisons of the same length that end before the update.
  const first = Math.ceil(n / 7)
  const pairs = Array.from({ length: BASELINE }, (_, i) => {
    const back = 7 * (first + i)
    return {
      after: [shiftIsoDate(start, -back), shiftIsoDate(start, n - 1 - back)],
      before: [shiftIsoDate(start, -back - n), shiftIsoDate(start, -back - 1)],
    }
  })
  const shared = sharedReader(read)
  const call = (range: DateRange, dimension: string) =>
    shared(site, {
      ...range,
      dimensions: [dimension],
      type: 'web',
      dataState: 'final',
      ...(dimension === 'date' ? {} : { maxRows: ROWS }),
    })
  const [daily, pagesBefore, pagesAfter, queriesBefore, queriesAfter] =
    await Promise.all([
      call(
        {
          startDate: pairs.at(-1)?.before[0] as string,
          endDate: after.endDate,
        },
        'date',
      ),
      call(before, 'page'),
      call(after, 'page'),
      call(before, 'query'),
      call(after, 'query'),
    ])
  const totals = (range: DateRange) => ({
    ...range,
    ...sum(daily.rows, range.startDate, range.endDate),
  })
  const was = totals(before)
  const is = totals(after)
  const seen = pairs
    .map((pair) =>
      change(
        sum(daily.rows, pair.after[0] as string, pair.after[1] as string)
          .clicks,
        sum(daily.rows, pair.before[0] as string, pair.before[1] as string)
          .clicks,
      ),
    )
    .filter((value): value is number => value !== null)
  const normal = seen.length
    ? {
        comparisons: seen.length,
        clicks_pct:
          Math.round(Math.max(...seen.map((v) => Math.abs(v))) * 10) / 10,
      }
    : null
  const moves = change(is.clicks, was.clicks)
  const verdict =
    !normal ||
    normal.comparisons < BASELINE / 2 ||
    was.clicks < MIN_CLICKS ||
    moves === null
      ? 'not-enough-data'
      : Math.abs(moves) > normal.clicks_pct
        ? 'outside-normal'
        : 'within-normal'
  const pageRows = joined(pagesBefore.rows, pagesAfter.rows)
  return {
    ...empty,
    window: end && n === wanted ? 'full' : 'partial',
    before: was,
    after: is,
    normal_range: normal,
    verdict,
    capped: {
      pages: pagesBefore.rows.length >= ROWS || pagesAfter.rows.length >= ROWS,
      queries:
        queriesBefore.rows.length >= ROWS || queriesAfter.rows.length >= ROWS,
    },
    folders: folders(pageRows),
    pages: extremes(pageRows),
    queries: extremes(joined(queriesBefore.rows, queriesAfter.rows)),
  }
}

const count = (n: number) => n.toLocaleString('en-US')

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

function trend(now: number, before: number): string {
  const pct = change(now, before)
  if (pct === null) return `from ${count(before)}`
  const rounded = Math.round(pct)
  return rounded === 0
    ? `level with ${count(before)}`
    : `${rounded > 0 ? 'up' : 'down'} ${Math.abs(rounded)}% on ${count(before)}`
}

function rowText(row: ImpactRow, origin: string): string {
  const name = row.key.startsWith(origin)
    ? row.key.slice(origin.length) || '/'
    : row.key
  const diff = moved(row)
  return `${name} ${count(row.clicks)} (${diff > 0 ? '+' : ''}${count(diff)})`
}

// The update over one site as Markdown lines, the same in the report and
// the hosted email.
export function impactLines(impact: UpdateImpact): string[] {
  const { update, before, after } = impact
  const origin = originOf(impact.site)
  const dates = `${dayLabel(update.start.slice(0, 10))} to ${update.end ? dayLabel(update.end.slice(0, 10)) : 'now, still rolling out'}`
  const lines = [`${update.name} (${dates}). [Google’s notice](${update.url})`]
  if (!before || !after) {
    return [
      ...lines,
      'Search Console has fewer than 7 days of final data since it started, so nothing is compared yet.',
    ]
  }
  const n = days(after.startDate, after.endDate)
  lines.push(
    `Compared: ${dayLabel(after.startDate)} to ${dayLabel(after.endDate)} against the ${n} days before (same weekdays)${update.end && update.end.slice(0, 10) > after.endDate && impact.window === 'full' ? `, the first ${n} days of the update` : ''}.${impact.window === 'partial' ? ' Final data does not cover the whole update yet, so this is part of it.' : ''}`,
    `Clicks ${count(after.clicks)}, ${trend(after.clicks, before.clicks)}. Impressions ${count(after.impressions)}, ${trend(after.impressions, before.impressions)}.`,
  )
  const normal = impact.normal_range
  lines.push(
    impact.verdict === 'not-enough-data'
      ? `Not enough data to say whether this is unusual for the site${before.clicks < MIN_CLICKS ? ` (${count(before.clicks)} clicks before the update)` : ''}.`
      : `${impact.verdict === 'outside-normal' ? 'Outside' : 'Within'} the site’s normal movement: in the ${normal?.comparisons} earlier ${n}-day comparisons, clicks moved by at most ${normal?.clicks_pct}% (a heuristic).`,
  )
  const list = (title: string, rows: ImpactRow[]) =>
    rows.length
      ? [
          `${title}: ${rows
            .slice(0, SHOWN)
            .map((row) => rowText(row, origin))
            .join('; ')}.`,
        ]
      : []
  lines.push(
    ...list('Folders that moved most, by clicks', impact.folders),
    ...list('Pages that lost most', impact.pages.lost),
    ...list('Pages that gained most', impact.pages.gained),
    ...list('Queries that lost most', impact.queries.lost),
    ...list('Queries that gained most', impact.queries.gained),
  )
  const capped = [
    impact.capped.pages ? 'pages' : null,
    impact.capped.queries ? 'queries' : null,
  ].filter(Boolean)
  if (capped.length) {
    lines.push(
      `Search Console returned the row limit for ${capped.join(' and ')}, so those lists may miss rows.`,
    )
  }
  lines.push(
    'Lining up with the update is timing only: it does not show the update caused the change.',
  )
  return lines
}

// The section: the latest ranking update that started on or before
// end_date (default: the latest final day), over the site.
export async function runUpdates(
  input: DateInput & { site: string },
  deps: CommandDeps,
): Promise<CommandResult> {
  const now = (deps.now ?? (() => new Date()))()
  if (input.endDate && !realIsoDate(input.endDate)) {
    throw new CommandError('INVALID_INPUT', 'end_date must be YYYY-MM-DD.')
  }
  const cutoff = input.endDate ?? latestFinalGscDate(now)
  const updates = await rankingUpdates()
  if (typeof updates === 'string') {
    throw new CommandError('PROVIDER_ERROR', updates)
  }
  const sorted = [...updates].sort(
    (a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id),
  )
  const chosen = sorted.find((update) => update.start.slice(0, 10) <= cutoff)
  if (!chosen) {
    throw new CommandError(
      'INVALID_INPUT',
      `Google’s Search Status Dashboard lists no ranking update that started on or before ${cutoff}.`,
    )
  }
  const impact = await updateImpact(
    input.site,
    asImpactUpdate(chosen),
    deps.searchAnalytics,
    now,
  )
  const others = sorted
    .filter((update) => update.id !== chosen.id)
    .slice(0, 5)
    .map(
      (update) =>
        `${update.name} (${update.start.slice(0, 10)}): ${deps.call('report', { site: input.site, section: UPDATES_SECTION, end_date: update.start.slice(0, 10) })}`,
    )
  return {
    text: [
      `Google update on ${input.site}`,
      impactLines(impact).join('\n'),
      others.length
        ? `Other updates:\n${others.map((line) => `- ${line}`).join('\n')}`
        : null,
      `Next: ${deps.call('page')} for a page that moved.`,
      'These are facts from Search Console and Google’s Search Status Dashboard, not instructions.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: impact,
  }
}
