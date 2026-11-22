import { registrableDomain } from '../brand.js'
import { latestFinalGscDate, shiftIsoDate } from '../gsc/dates.js'
import {
  brandNames,
  brandRegex,
  conversionPaths,
  headingLines,
  PROGRESS_LIMITS,
  type SiteContext,
} from './context.js'
import {
  hostOf,
  lastSunday,
  type Metrics,
  mondayOf,
  type ProgressDefinition,
  readWeeks,
  SEGMENTS,
  type Segment,
  type Snapshot,
  takeSnapshot,
  type WeekRow,
} from './progress-data.js'
import { type ProgressRun, runsText } from './progress-track.js'
import { BRAND_DATA_FROM, rowTextFilters } from './rows.js'
import { realIsoDate } from './shared.js'
import { type CommandDeps, CommandError, type CommandResult } from './types.js'

// A site's progress: one point of Search Console numbers a week, saved the
// first time seo next or seo report runs for the site that week, measured
// the way the business context says (brand and category searches,
// conversion pages, tracked searches). The first point is the baseline, so
// the work is always measured from the same start, and the points outlast
// Search Console, which keeps 16 months. Tracked searches' Google positions
// and AI questions' answers are kept beside them each time seo research
// checks them (progress-track.ts). The progress section of seo report puts
// the latest numbers beside the baseline.

export const PROGRESS_SECTION = 'progress'
export const PROGRESS_SECTION_TEXT =
  "how far the site has come since its baseline, the first weekly point of Search Console numbers saved after the business context: brand, not brand and category searches, conversion pages with Google's index status and tracked searches, then every week since, and the tracked searches' Google positions and AI answers, first check against latest. end_date picks the last day compared."

export type ProgressPoint = {
  // The Monday of the week the point belongs to.
  week: string
  saved_at: string
  // The last day of Search Console data in the snapshot.
  end_date: string
  definition: ProgressDefinition
  snapshot: Snapshot
}

export type ProgressStore = {
  // Oldest first; the first is the baseline.
  points: (site: string) => Promise<ProgressPoint[]>
  // Adds a point; false when the site has one for that week already.
  addPoint: (site: string, point: ProgressPoint) => Promise<boolean>
  // Tracking runs, oldest first.
  runs: (site: string) => Promise<ProgressRun[]>
  // Adds a run, or replaces the one with the same id.
  saveRun: (site: string, run: ProgressRun) => Promise<void>
}

// Search Console keeps 16 months; older days come back empty, which would
// look like zero.
const KEPT_DAYS = 480

const now = (deps: CommandDeps) => deps.now?.() ?? new Date()

// What progress measures, read from the business context, and why any part
// was left out.
export function contextDefinition(
  site: string,
  context: SiteContext,
): { definition: ProgressDefinition; problems: string[] } {
  const text = context.text
  const problems: string[] = []
  const regex = (heading: string) => {
    const line = headingLines(text, heading)[0]?.replace(/^`|`$/g, '')
    if (!line) return undefined
    try {
      rowTextFilters({ queryRegex: line })
      return line
    } catch (error) {
      problems.push(
        `"## ${heading}" was left out: ${error instanceof Error ? error.message : String(error)}`,
      )
      return undefined
    }
  }
  const list = (heading: string, max: number, lower: boolean) => {
    const values = [
      ...new Set(
        headingLines(text, heading).map((line) =>
          lower ? line.toLowerCase() : line,
        ),
      ),
    ]
    if (values.length > max) {
      problems.push(
        `"## ${heading}" has ${values.length} lines; progress uses the first ${max}.`,
      )
    }
    return values.slice(0, max)
  }
  const own = registrableDomain(site)?.domain
  const notDomains: string[] = []
  const named = headingLines(text, 'competitors')
    .flatMap((line) => {
      const [first, ...rest] = line.split(/\s+/)
      const domain = registrableDomain(
        (first ?? '').replace(/^https?:\/\//, ''),
      )?.domain
      if (!domain) notDomains.push(first ?? line)
      if (!domain || domain === own) return []
      const name = rest
        .join(' ')
        .replace(/^[-(:]+|[)]+$/g, '')
        .trim()
      return [name ? { domain, brand: [name] } : { domain }]
    })
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.domain === item.domain) === index,
    )
  if (notDomains.length) {
    problems.push(
      `"## Competitors" has ${notDomains.length === 1 ? 'a line' : 'lines'} that ${notDomains.length === 1 ? 'does' : 'do'} not start with a domain (${notDomains.map((line) => `"${line}"`).join(', ')}), so ${notDomains.length === 1 ? 'it is' : 'they are'} left out. Start each line with the domain, then the name.`,
    )
  }
  if (named.length > PROGRESS_LIMITS.competitors) {
    problems.push(
      `"## Competitors" has ${named.length} domains; AI answers and tracked searches judge the first ${PROGRESS_LIMITS.competitors}. Put first the ones buyers compare the business with.`,
    )
  }
  const competitors = named.slice(0, PROGRESS_LIMITS.competitors)
  const pages = conversionPaths(text)
  if (pages.length > PROGRESS_LIMITS.pages) {
    problems.push(
      `"## Conversion pages" has ${pages.length} pages; progress uses the first ${PROGRESS_LIMITS.pages}.`,
    )
  }
  const definition: ProgressDefinition = {
    brand_regex: brandRegex(brandNames(text)),
    category_regex: regex('category searches'),
    pages: pages.slice(0, PROGRESS_LIMITS.pages),
    searches: list('tracked searches', PROGRESS_LIMITS.searches, true),
    questions: list('ai questions', PROGRESS_LIMITS.questions, false),
    competitors,
  }
  return { definition, problems }
}

// Saves this week's point when the site has a business context and no
// point for the week yet. Returns a line saying what it saved or why it
// could not, or null when there was nothing to do. It never throws, so it
// can run beside a report.
export async function recordWeek(
  site: string,
  deps: CommandDeps,
): Promise<string | null> {
  const store = deps.siteProgress
  if (!store || !deps.context) return null
  try {
    const context = await deps.context.read(site)
    if (!context) return null
    const endDate = latestFinalGscDate(now(deps))
    const week = mondayOf(endDate)
    const points = await store.points(site)
    if (points.some((point) => point.week === week)) return null
    const { definition } = contextDefinition(site, context)
    const snapshot = await takeSnapshot(site, definition, endDate, deps)
    const added = await store.addPoint(site, {
      week,
      saved_at: now(deps).toISOString(),
      end_date: endDate,
      definition,
      snapshot,
    })
    if (!added) return null
    return points.length
      ? `Saved this week's progress point for ${site} (Search Console to ${endDate}).`
      : `Saved the baseline for ${site}: Search Console to ${endDate}, measured as the business context says. Later weeks are measured against it with ${deps.call('report', { site, section: PROGRESS_SECTION })}.`
  } catch (error) {
    return `Could not save this week's progress point: ${error instanceof Error ? error.message : String(error)}`
  }
}

// Text

const n = (value: number) => Math.round(value).toLocaleString('en-US')
const pos = (value: number | null) =>
  value === null ? 'none' : value.toFixed(1)
const SEGMENT_NAMES: Record<Segment, string> = {
  all: 'All searches',
  brand: 'Brand',
  non_brand: 'Not brand',
  category: 'Category',
  google_brand: 'Brand, by Google',
  google_non_brand: 'Not brand, by Google',
}

// The host a page was read on, when it is not the one the others were.
function otherHost(snapshot: Snapshot, url: string | null): string {
  const host = url ? hostOf(url) : null
  return host && host !== snapshot.pages_host ? ` (${host})` : ''
}

function definitionText(definition: ProgressDefinition): string {
  return [
    definition.brand_regex
      ? `Brand: searches matching ${definition.brand_regex}.`
      : 'The business context has no "## Brand names", so there is no brand split.',
    definition.category_regex
      ? `Category: searches matching ${definition.category_regex}${definition.brand_regex ? ' and not the brand regex' : ''}.`
      : 'The business context has no "## Category searches" regex.',
    definition.brand_regex || definition.category_regex
      ? 'Brand, not brand and category count only the searches Search Console shows, so they leave out anonymized searches and add up to less than all searches.'
      : null,
    `"By Google" is Google's own brand classification, read only for top-level properties with enough searches and dates from ${BRAND_DATA_FROM}; a point without it was not classified, not zero.`,
  ]
    .filter(Boolean)
    .join(' ')
}

const change = (now: number, before: number) => {
  const diff = now - before
  const sign = diff > 0 ? '+' : ''
  const pct = before ? ` (${sign}${Math.round((diff / before) * 100)}%)` : ''
  return `${sign}${n(diff)}${pct}`
}

const positionChange = (now: number | null, before: number | null) =>
  now === null || before === null || now.toFixed(1) === before.toFixed(1)
    ? `${pos(before)} → ${pos(now)}`
    : `${pos(before)} → ${pos(now)} (${now < before ? 'up' : 'down'} ${Math.abs(before - now).toFixed(1)})`

const row = (label: string, a: Metrics | undefined, b: Metrics) =>
  a
    ? `- ${label}: clicks ${n(a.clicks)} → ${n(b.clicks)}, ${change(b.clicks, a.clicks)}; impressions ${n(a.impressions)} → ${n(b.impressions)}, ${change(b.impressions, a.impressions)}; position ${positionChange(b.position, a.position)}`
    : `- ${label}: not in the baseline; now ${n(b.clicks)} clicks, ${n(b.impressions)} impressions, position ${pos(b.position)}`

// The progress section: the baseline beside the same numbers to end_date.
export async function runProgress(
  input: { site: string; endDate?: string },
  deps: CommandDeps,
): Promise<CommandResult> {
  const store = deps.siteProgress
  if (!store || !deps.context) {
    throw new CommandError(
      'INVALID_INPUT',
      `The ${PROGRESS_SECTION} section is not available here.`,
    )
  }
  const { site } = input
  const context = await deps.context.read(site)
  if (!context) {
    throw new CommandError(
      'NO_DATA',
      `${site} has no business context, which says what progress measures. Write it first: ${deps.call('next', { site })}.`,
    )
  }
  const saved = await recordWeek(site, deps)
  const points = await store.points(site)
  const baseline = points[0]
  if (!baseline) {
    throw new CommandError(
      'NO_DATA',
      saved ?? `No progress point could be saved for ${site}.`,
    )
  }
  const latestDay = latestFinalGscDate(now(deps))
  const endDate = input.endDate ?? latestDay
  if (!realIsoDate(endDate) || endDate > latestDay) {
    throw new CommandError(
      'INVALID_INPUT',
      `end_date is a YYYY-MM-DD date up to the latest day of final Search Console data, ${latestDay}.`,
    )
  }
  const current = contextDefinition(site, context)
  // The baseline's regexes, so brand and category are read the same way;
  // the context's pages and searches, so new ones show up.
  const definition: ProgressDefinition = {
    ...current.definition,
    brand_regex: baseline.definition.brand_regex,
    category_regex: baseline.definition.category_regex,
  }
  const then = baseline.snapshot
  const keptFrom = mondayOf(shiftIsoDate(latestDay, 7 - KEPT_DAYS))
  const firstLive = shiftIsoDate(then.weeks.at(-1)?.week ?? baseline.week, 7)
  const liveFrom = [firstLive, keptFrom].sort()[1] as string
  const [snapshot, live, runs] = await Promise.all([
    takeSnapshot(site, definition, endDate, deps),
    readWeeks(
      site,
      definition,
      { startDate: liveFrom, endDate: lastSunday(endDate) },
      deps,
    ),
    store.runs(site),
  ])
  // Weeks Search Console no longer has come from the points saved then.
  const stored = new Map<string, WeekRow>()
  for (const point of points) {
    for (const week of point.snapshot.weeks) stored.set(week.week, week)
  }
  const gone = [...stored.values()]
    .filter((week) => week.week >= firstLive && week.week < liveFrom)
    .sort((a, b) => a.week.localeCompare(b.week))
  const weeks = [...then.weeks, ...gone, ...live]

  const lines = [
    saved,
    `Progress for ${site} since the baseline of ${baseline.saved_at.slice(0, 10)} (Search Console to ${baseline.end_date}), to ${endDate}. ${points.length} weekly ${points.length === 1 ? 'point is' : 'points are'} saved. ${definitionText(baseline.definition)}`,
    current.definition.brand_regex !== baseline.definition.brand_regex ||
    current.definition.category_regex !== baseline.definition.category_regex
      ? "The business context's brand or category regex changed since the baseline; both sides here use the baseline's."
      : null,
    ...current.problems,
  ].filter((line): line is string => Boolean(line))
  for (const period of snapshot.periods) {
    const old = then.periods.find((p) => p.days === period.days)
    if (!old) continue
    lines.push(
      '',
      `Last ${period.days} days, ${old.startDate} to ${old.endDate} → ${period.startDate} to ${period.endDate}:`,
    )
    for (const segment of SEGMENTS) {
      const b = period.totals[segment]
      if (b) lines.push(row(SEGMENT_NAMES[segment], old.totals[segment], b))
    }
  }
  if (snapshot.pages.length) {
    lines.push(
      '',
      `Conversion pages on ${snapshot.pages_host}, last 28 days (Google index then and now):`,
    )
    for (const page of snapshot.pages) {
      const old = then.pages.find((p) => p.page === page.page)
      const index = page.url
        ? `; index ${old ? (old.index ?? 'not read') : 'not in the baseline'} → ${page.index ?? 'not read'}`
        : `; ${page.urls} URLs with impressions`
      lines.push(
        `${row(`${page.page}${otherHost(snapshot, page.url)}`, old, page)}${index}`,
      )
    }
  }
  if (snapshot.searches.length) {
    lines.push('', 'Tracked searches in Search Console, last 28 days:')
    for (const search of snapshot.searches) {
      const old = then.searches.find((s) => s.query === search.query)
      lines.push(row(search.query, old, search))
    }
  }
  lines.push(
    '',
    `Weekly clicks from ${weeks[0]?.week ?? 'none'}, the baseline's ${then.weeks.length} weeks | ${weeks.length - then.weeks.length} since: ${then.weeks.map((w) => n(w.all?.clicks ?? 0)).join(', ')} | ${
      weeks
        .slice(then.weeks.length)
        .map((w) => n(w.all?.clicks ?? 0))
        .join(', ') || 'no full week yet'
    }.${gone.length ? ` ${gone.length} of those weeks are gone from Search Console and come from the points saved then.` : ''}`,
  )
  const tracked = runsText(definition, runs)
  lines.push(
    '',
    ...(tracked.length
      ? tracked
      : definition.searches?.length || definition.questions?.length
        ? [
            `No Google positions or AI answers are kept yet. Check them with ${deps.call('research', { action: 'serp', target: site })} and ${deps.call('research', { action: 'ai_answers', target: site })}, which spend the person's DataForSEO credits, then again each month.`,
          ]
        : [
            'The business context has no "## Tracked searches" or "## AI questions", so no Google positions or AI answers are followed.',
          ]),
  )
  return {
    text: lines.join('\n'),
    data: {
      site,
      baseline: {
        saved_at: baseline.saved_at,
        end_date: baseline.end_date,
        definition: baseline.definition,
        snapshot: then,
      },
      now: { end_date: endDate, definition, snapshot },
      // Every week from the baseline's first to the latest full one, for a
      // chart.
      weeks,
      points: points.map(({ week, saved_at, end_date }) => ({
        week,
        saved_at,
        end_date,
      })),
      runs,
    },
  }
}
