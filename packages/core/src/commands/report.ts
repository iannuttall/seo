import { ctrUnderperformersReportWith } from '../analyze/ctr-underperformers-report.js'
import { secondPageWith } from '../analyze/second-page-report.js'
import { cannibalReportWith } from '../analyze/site-diagnostics/cannibal-report.js'
import { decayingReportWith } from '../analyze/site-diagnostics/decaying-report.js'
import { quickWinsReportWith } from '../analyze/site-diagnostics/quick-wins-report.js'
import { strikingDistanceWith } from '../analyze/striking-distance-report.js'
import { changeWindow } from '../analyze/traffic-anomaly-analysis.js'
import { trafficAnomalyWith } from '../analyze/traffic-anomaly-report.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import {
  type BingSource,
  bingFor,
  bingSection,
  bingTotals,
  enginesText,
  NO_BING_HERE,
} from './bing.js'
import { temporaryRedirectNote } from './page-facts.js'
import { type Detail, presentReport, preview, table } from './present.js'
import {
  type DateInput,
  dateWindow,
  earlierRange,
  FACTS_ONLY,
  factsOnly,
  googleUpdates,
  listOfUpdates,
  originOf,
  pct,
  sharedReader,
  UPDATE_PADDING_DAYS,
} from './shared.js'
import type {
  Caller,
  CommandDeps,
  CommandResult,
  DateRange,
  PageFacts,
} from './types.js'

// The main report: one overview plus sections, each from the same report
// code. Without a section it shows every section's count and top rows; with
// a section it shows that section's rows and checks its top pages live.

export const SECTIONS = {
  overview:
    'Site totals (clicks, impressions, CTR, position) against the previous period, by device, with the top pages and queries and their change.',
  'quick-wins':
    'Query and page pairs at average positions 4 to 10 with a click-through rate below the site’s own curve for that position.',
  'low-ctr':
    'Query and page pairs at average positions 1 to 4 with a click-through rate below the site’s own curve: titles and snippets to review with the person.',
  'striking-distance':
    'Queries just outside the top positions, with impressions, for pages that already rank.',
  'second-page':
    'Pages with an average position of 11 to 20 and their queries.',
  'content-decay':
    'Query and page pairs that lost clicks against the previous period.',
  cannibalization:
    'Queries where more than one page of the site gets impressions, with each page’s share.',
  'traffic-drop':
    'Daily clicks and impressions checked for a sudden change that lasted, with the date it started (else the last 7 days against the days before), and Google updates within 3 days of that date. Overlap is timing only, not cause.',
  bing: 'Bing’s top queries from Bing Webmaster Tools with Google’s clicks, impressions and position for the same query beside them, and the same for pages.',
} as const

export type SectionId = keyof typeof SECTIONS
export const SECTION_IDS = Object.keys(SECTIONS) as [SectionId, ...SectionId[]]

// Sections whose top URLs are checked live. Same-site redirects found there
// are merged into their targets and the section runs again.
const PAGE_CHECKS = new Set<SectionId>([
  'quick-wins',
  'low-ctr',
  'striking-distance',
  'second-page',
  'content-decay',
  'cannibalization',
])

const DEFAULT_DAYS: Record<SectionId, number> = {
  overview: 28,
  'quick-wins': 28,
  'low-ctr': 28,
  'striking-distance': 28,
  'second-page': 28,
  'content-decay': 28,
  cannibalization: 28,
  'traffic-drop': 90,
  bing: 28,
}

// What to run next when it helps. Agents follow these; nothing else.
function nextFor(section: SectionId, call: Caller): string {
  const section_ = (id: SectionId) => `section "${id}"`
  return {
    overview: `Next: ${call('compare')} with a change date, or ${call('page')} for one page that moved.`,
    'quick-wins': `Next: ${call('page')} for one page’s queries and live facts; ${section_('low-ctr')} for the top positions.`,
    'low-ctr': `Next: ${call('page')} for one page; ${call('research')} serp to see who else ranks.`,
    'striking-distance': `Next: ${section_('second-page')} to see the same pages by page; ${call('research')} keyword_metrics for search volume.`,
    'second-page': `Next: ${call('page')} for one page’s queries and live facts.`,
    'content-decay': `Next: ${call('index')} for pages that lost most of their clicks; ${call('page')} to see which queries moved.`,
    cannibalization: `Next: ${call('page')} on each competing URL to see Google’s chosen canonical.`,
    'traffic-drop': `Next: ${call('compare')} with the date the drop started, for the pages and queries that moved; ${call('index')} for pages that lost almost all their clicks and their index status.`,
    bing: `Next: ${call('data', { source: 'bing' })} for every Bing row; ${call('page')} for one page.`,
  }[section]
}

// Totals, devices, top pages and top queries, now against before. With a
// page filter, only pages whose URL contains it count.
export async function siteOverview(
  read: SearchAnalyticsQuery,
  site: string,
  range: DateRange,
  before: DateRange,
  pageContains?: string,
): Promise<Record<string, unknown>> {
  const get = (dimensions: string[], window: DateRange, maxRows = 1000) =>
    read(site, {
      ...window,
      dimensions,
      type: 'web',
      dataState: 'final',
      maxRows,
      ...(pageContains
        ? {
            dimensionFilterGroups: [
              {
                groupType: 'and' as const,
                filters: [
                  {
                    dimension: 'page' as const,
                    operator: 'contains' as const,
                    expression: pageContains,
                  },
                ],
              },
            ],
          }
        : {}),
    })
  const [
    total,
    totalBefore,
    device,
    deviceBefore,
    pages,
    pagesBefore,
    queries,
    queriesBefore,
  ] = await Promise.all([
    get([], range),
    get([], before),
    get(['device'], range),
    get(['device'], before),
    get(['page'], range, 5000),
    get(['page'], before, 5000),
    get(['query'], range, 5000),
    get(['query'], before, 5000),
  ])
  const row = (r?: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }) => r ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  const now = row(total.rows[0])
  const then = row(totalBefore.rows[0])
  const compare = (
    current: typeof pages.rows,
    earlier: typeof pages.rows,
    name: string,
    limit: number,
  ) => {
    const old = new Map(earlier.map((r) => [r.keys[0], r]))
    const seen = new Set(current.map((r) => r.keys[0]))
    const rows = current.map((r) => {
      const earlierRow = old.get(r.keys[0])
      return {
        [name]: r.keys[0],
        clicks: r.clicks,
        previousClicks: earlierRow?.clicks ?? 0,
        clicksChange: r.clicks - (earlierRow?.clicks ?? 0),
        impressions: r.impressions,
        previousImpressions: earlierRow?.impressions ?? 0,
        impressionsChange: r.impressions - (earlierRow?.impressions ?? 0),
        position: r.position,
      }
    })
    for (const r of earlier) {
      if (seen.has(r.keys[0])) continue
      rows.push({
        [name]: r.keys[0],
        clicks: 0,
        previousClicks: r.clicks,
        clicksChange: -r.clicks,
        impressions: 0,
        previousImpressions: r.impressions,
        impressionsChange: -r.impressions,
        position: 0,
      })
    }
    const by = (key: 'clicksChange' | 'impressionsChange', sign: 1 | -1) =>
      [...rows]
        .sort((a, b) => sign * (Number(b[key]) - Number(a[key])))
        .filter((r) => sign * Number(r[key]) > 0)
        .slice(0, limit)
    return {
      top: rows.slice(0, limit),
      biggestLosses: by('clicksChange', -1),
      biggestGains: by('clicksChange', 1),
      biggestImpressionLosses: by('impressionsChange', -1),
    }
  }
  const devices = new Map(deviceBefore.rows.map((r) => [r.keys[0], r]))
  return {
    range,
    comparisonRange: before,
    ...(pageContains ? { pageContains } : {}),
    summary: {
      clicks: now.clicks,
      previousClicks: then.clicks,
      clicksChangePct: pct(now.clicks, then.clicks),
      impressions: now.impressions,
      previousImpressions: then.impressions,
      impressionsChangePct: pct(now.impressions, then.impressions),
      ctr: Math.round(now.ctr * 10000) / 10000,
      previousCtr: Math.round(then.ctr * 10000) / 10000,
      position: Math.round(now.position * 10) / 10,
      previousPosition: Math.round(then.position * 10) / 10,
    },
    devices: device.rows.map((r) => ({
      device: r.keys[0],
      clicks: r.clicks,
      previousClicks: devices.get(r.keys[0])?.clicks ?? 0,
      impressions: r.impressions,
      position: r.position,
    })),
    pages: compare(pages.rows, pagesBefore.rows, 'page', 15),
    queries: compare(queries.rows, queriesBefore.rows, 'query', 15),
    caveats: [
      'Totals come from Search Console with no dimension, so they include queries that Search Console hides for privacy.',
      'Page and query lists cover the top 5,000 rows in each period.',
    ],
  }
}

// Totals, devices and the pages and queries that moved, as text.
export function overviewText(
  report: Record<string, unknown>,
  heading: string,
  origin: string,
  rowsPerList: number,
): string {
  const range = report.range as DateRange
  const before = report.comparisonRange as DateRange
  const t = report.summary as Record<string, number | null>
  const change = (value: number | null | undefined) =>
    value === undefined || value === null
      ? 'n/a'
      : `${value > 0 ? '+' : ''}${value}%`
  const section = (name: string, key: 'page' | 'query') => {
    const group = (report[key === 'page' ? 'pages' : 'queries'] ??
      {}) as Record<string, Record<string, unknown>[] | undefined>
    const columns = [
      key,
      'clicks',
      'previousClicks',
      'clicksChange',
      'impressions',
      'impressionsChange',
      'position',
    ]
    const part = (title: string, rows: Record<string, unknown>[]) =>
      rows.length
        ? `${title}:\n${table(rows.slice(0, rowsPerList), columns, origin)}`
        : ''
    return [
      rowsPerList >= 10 ? part(`Top ${name} by clicks`, group.top ?? []) : '',
      part(`Biggest ${name} click losses`, group.biggestLosses ?? []) ||
        `No ${name} lost clicks.`,
      part(
        `Biggest ${name} impression losses`,
        group.biggestImpressionLosses ?? [],
      ),
      part(`Biggest ${name} click gains`, group.biggestGains ?? []),
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  return [
    `${heading}, ${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}${report.pageContains ? `, pages whose URL contains "${report.pageContains}"` : ''}.`,
    `Totals: clicks ${t.clicks} (was ${t.previousClicks}, ${change(t.clicksChangePct)}), impressions ${t.impressions} (was ${t.previousImpressions}, ${change(t.impressionsChangePct)}), CTR ${t.ctr} (was ${t.previousCtr}), average position ${t.position} (was ${t.previousPosition}).`,
    `Devices:\n${table(report.devices as Record<string, unknown>[], ['device', 'clicks', 'previousClicks', 'impressions', 'position'], null)}`,
    section('pages', 'page'),
    section('queries', 'query'),
    `Limits:\n${(report.caveats as string[]).map((line) => `- ${line}`).join('\n')}`,
  ].join('\n\n')
}

function once<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | undefined
  return () => {
    made ??= make()
    return made
  }
}

// Google and Bing totals for the overview's dates. A Bing failure is named
// and never stops the report.
async function enginesLine(
  overview: Record<string, unknown>,
  bing: () => Promise<BingSource>,
): Promise<string> {
  const summary = overview.summary as {
    clicks: number
    previousClicks: number
    impressions: number
  }
  try {
    return enginesText(
      summary,
      await bingTotals(
        await bing(),
        overview.range as DateRange,
        overview.comparisonRange as DateRange,
      ),
    )
  } catch (error) {
    return `Bing: could not be read. ${error instanceof Error ? error.message : String(error)}`
  }
}

// One way to run each section: brand terms, minimums and the comparison
// period are automatic and shown in the output.
async function build(
  read: SearchAnalyticsQuery,
  site: string,
  section: SectionId,
  range: DateRange,
  now: () => Date,
  bing: () => Promise<BingSource>,
): Promise<Record<string, unknown>> {
  const dependencies = { searchAnalytics: read, now }
  const common = { site, limit: 100, includeBrand: false, ...range }
  const run = {
    overview: () => siteOverview(read, site, range, earlierRange(range)),
    'quick-wins': () =>
      quickWinsReportWith({ ...common, verifyContent: false }, dependencies),
    'low-ctr': () => ctrUnderperformersReportWith(common, dependencies),
    'striking-distance': () =>
      strikingDistanceWith({ ...common, verifyContent: false }, dependencies),
    'second-page': () =>
      secondPageWith({ ...common, verifyContent: false }, dependencies),
    'content-decay': () =>
      decayingReportWith(
        { ...common, comparison: 'previous-period' },
        dependencies,
      ),
    cannibalization: async () => {
      const result = (await cannibalReportWith(
        common,
        dependencies,
      )) as unknown as Record<string, unknown>
      // The competing URLs and the page with the most clicks, in each row.
      const items =
        (result.items as Record<string, unknown>[] | undefined) ?? []
      return {
        ...result,
        items: items.map((item) => {
          const pages =
            (item.pages as { url: string; impressionShare: number }[]) ?? []
          return {
            ...item,
            urls: pages
              .map(
                (page) =>
                  `${page.url} (${Math.round(page.impressionShare * 100)}%)`,
              )
              .join(' ; '),
            topPage: item.suggestedOwnerUrl,
          }
        }),
      }
    },
    'traffic-drop': async () => {
      const result = await trafficAnomalyWith(
        { site, ...range, recentDays: 7 },
        dependencies,
      )
      // A step change is checked at its own date, so an update that starts
      // weeks later is not reported as overlapping it.
      const window = changeWindow(result.anomalies)
      return {
        ...result,
        updateWindow: window && { ...window, paddingDays: UPDATE_PADDING_DAYS },
        googleUpdates: await googleUpdates(window),
      }
    },
    bing: async () => bingSection(await bing(), read, site, range),
  }[section]
  return factsOnly(await run()) as Record<string, unknown>
}

function brandNote(report: Record<string, unknown>): string | null {
  const brand = report.brand as
    | { terms?: string[]; excluded?: { term: string }[] }
    | undefined
  if (!brand?.terms) return null
  return `Brand terms left out: ${brand.terms.join(', ') || 'none'}${
    brand.excluded?.length
      ? `. Not treated as brand: ${brand.excluded.map((item) => item.term).join(', ')}`
      : ''
  }.`
}

// URLs in a report's main rows, in order, at most 20.
export function reportUrls(rows: unknown[], origin: string): string[] {
  const found: string[] = []
  const visit = (value: unknown, key = '') => {
    if (found.length >= 20) return
    if (typeof value === 'string') {
      if (/^(url|page|finalUrl|targetUrl)$/i.test(key)) {
        const url = value.startsWith('/') ? `${origin}${value}` : value
        if (/^https?:\/\//.test(url) && !found.includes(url)) found.push(url)
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key)
    } else if (value && typeof value === 'object') {
      for (const [child, item] of Object.entries(value)) visit(item, child)
    }
  }
  for (const row of rows) visit(row)
  return found
}

export function pageFactsTable(
  checked: PageFacts[],
  origin: string | null,
): string {
  const rows = table(
    checked as unknown as Record<string, unknown>[],
    [
      'url',
      'status',
      'redirects_to',
      'title',
      'description',
      'h1',
      'canonical',
      'robots',
      ...(checked.some((page) => page.error) ? ['error'] : []),
    ],
    origin,
    320,
  )
  const note = temporaryRedirectNote(checked)
  return note ? `${rows}\n${note}` : rows
}

export type ReportInput = DateInput & {
  site: string
  section?: SectionId
  detail?: Detail
  offset?: number
}

const PAGE_SIZE = 50

async function allSections(
  input: ReportInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  const now = deps.now ?? (() => new Date())
  const read = sharedReader(deps.searchAnalytics)
  const origin = originOf(input.site)
  const bing = once(() => bingFor(deps, input.site))
  // A surface without Bing leaves the bing section out.
  const ids = SECTION_IDS.filter((id) => id !== 'bing' || deps.bing)
  const runs = await Promise.all(
    ids.map((id) =>
      build(
        read,
        input.site,
        id,
        dateWindow(input, DEFAULT_DAYS[id]),
        now,
        bing,
      ).catch((error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
      ),
    ),
  )
  const [overview, ...rest] = runs
  if (!overview || overview instanceof Error) {
    throw overview ?? new Error('The overview did not run.')
  }
  const parts = [overviewText(overview, `Report on ${input.site}`, origin, 5)]
  parts.push(deps.bing ? await enginesLine(overview, bing) : NO_BING_HERE)
  const brand = rest.find(
    (run): run is Record<string, unknown> =>
      !(run instanceof Error) && brandNote(run) !== null,
  )
  if (brand) parts.push(brandNote(brand) as string)
  const sections: Record<string, unknown> = {}
  ids.slice(1).forEach((id, index) => {
    const run = rest[index]
    if (!run || run instanceof Error) {
      const message = run?.message ?? 'did not run'
      parts.push(`## ${id}\nNot available: ${message}`)
      sections[id] = { error: message }
      return
    }
    const shown = preview(run, origin, 3)
    sections[id] = { total: shown.total }
    parts.push(
      [
        `## ${id}: ${shown.total} ${shown.total === 1 ? 'row' : 'rows'}`,
        SECTIONS[id],
        shown.text,
        id === 'traffic-drop'
          ? listOfUpdates(run.googleUpdates, run.updateWindow)
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  })
  parts.push(
    `More: ${deps.call('report', { site: input.site, section: '<section>' })} for its rows (${ids.join(', ')}). Page sections also check their top 20 URLs live and merge same-site redirects.`,
  )
  return {
    text: `${parts.join('\n\n')}\n\n${FACTS_ONLY}`,
    data: { site: input.site, overview, sections },
  }
}

async function oneSection(
  input: ReportInput & { section: SectionId },
  deps: CommandDeps,
): Promise<CommandResult> {
  const now = deps.now ?? (() => new Date())
  const { site, section } = input
  const detail = input.detail ?? 'summary'
  const range = dateWindow(input, DEFAULT_DAYS[section])
  const origin = originOf(site)
  const bing = once(() => bingFor(deps, site))
  let report = await build(
    sharedReader(deps.searchAnalytics),
    site,
    section,
    range,
    now,
    bing,
  )
  const next = nextFor(section, deps.call)
  if (section === 'overview' && detail !== 'full') {
    return {
      text: `${overviewText(report, `overview of ${site}`, origin, 10)}\n\n${deps.bing ? await enginesLine(report, bing) : NO_BING_HERE}\n\nMore: ${deps.call('report', { site, section, detail: 'full' })} for every row.\n\n${next}\n\n${FACTS_ONLY}`,
      data: report,
    }
  }
  let checked: PageFacts[] = []
  const merged: string[] = []
  if (PAGE_CHECKS.has(section)) {
    const list = Object.values(report).find(
      (value) => Array.isArray(value) && value.length > 0,
    ) as unknown[] | undefined
    checked = await deps.checkPages(
      reportUrls((report.items as unknown[] | undefined) ?? list ?? [], origin),
    )
    const redirects = new Map<string, string>()
    for (const page of checked) {
      if (!page.redirects_to) continue
      if (new URL(page.redirects_to).host !== new URL(page.url).host) continue
      redirects.set(page.url, page.redirects_to.replace(/#.*$/, ''))
      merged.push(`${page.url} → ${page.redirects_to}`)
    }
    if (redirects.size) {
      report = await build(
        sharedReader(deps.searchAnalytics, redirects),
        site,
        section,
        range,
        now,
        bing,
      )
    }
    report.pageChecks = checked
  }
  const notes: string[] = []
  const brand = brandNote(report)
  if (brand) notes.push(brand)
  const updates = listOfUpdates(report.googleUpdates, report.updateWindow)
  if (updates) notes.push(updates)
  if (checked.length) {
    notes.push(
      `Live page checks (${checked.length} URLs, fetched now, no redirects followed):\n${pageFactsTable(checked, origin)}`,
    )
  }
  if (merged.length) {
    notes.push(
      `Redirect sources merged into their targets, so each pair counts as one page here: ${merged.join('; ')}.`,
    )
  }
  const before = earlierRange(range)
  const shown = presentReport({
    report,
    headline: [
      `${section} on ${site}.`,
      typeof report.verdict === 'string' ? report.verdict : '',
    ]
      .filter(Boolean)
      .join(' '),
    label: section,
    range:
      section === 'content-decay'
        ? `${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}`
        : `${range.startDate} to ${range.endDate}`,
    notes,
    origin,
    detail,
    offset: input.offset ?? 0,
    limit: PAGE_SIZE,
    more: (level, offset) =>
      deps.call('report', { site, section, detail: level, offset }),
  })
  const facts =
    section === 'bing'
      ? FACTS_ONLY.replace('Search Console', 'Search Console and Bing')
      : FACTS_ONLY
  return {
    text: `${shown.text}\n\n${next}\n\n${facts}`,
    data: detail === 'full' ? report : shown.data,
  }
}

// The site must already be a Search Console property name, such as
// sc-domain:example.com.
export function runReport(
  input: ReportInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  return input.section
    ? oneSection({ ...input, section: input.section }, deps)
    : allSections(input, deps)
}
