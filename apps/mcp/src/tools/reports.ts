import {
  cannibalReportWith,
  ctrUnderperformersReportWith,
  decayComparisonRange,
  decayingReportWith,
  finalGscDateRange,
  findOverlappingSearchUpdates,
  quickWinsReportWith,
  type SearchAnalyticsQuery,
  searchUpdatesFromIncidents,
  secondPageWith,
  strikingDistanceWith,
  trafficAnomalyWith,
} from '@seo/core/hosted'
import { z } from 'zod'
import { MAX_ROWS, resolveProperty, searchAnalytics } from '../google.ts'
import { pageFacts, reportUrls } from '../pages.ts'
import { type Detail as DetailLevel, presentReport, table } from './present.ts'
import {
  DateWindow,
  Detail,
  defineTool,
  PAGE_SIZE,
  Site,
  ToolError,
} from './registry.ts'

// Reports built only from Search Console rows, with the same analysis code as
// the open-source CLI. They return facts. Advice fields from the analysis
// code are removed: the agent and the person decide what to do.

export const REPORTS = {
  'site-overview':
    'Site totals (clicks, impressions, CTR, position) against the previous period, by device, with the top pages and queries and their change. Call it first.',
  'quick-wins':
    'Query and page pairs at average positions 4 to 10 with a click-through rate below the site’s own curve for that position.',
  'low-ctr':
    'Query and page pairs at average positions 1 to 4 with a click-through rate below the site’s own curve: titles and snippets to review with the person.',
  'striking-distance':
    'Queries just outside the top positions, with impressions, for pages that already rank.',
  'second-page':
    'Pages with an average position of 11 to 20 and their queries.',
  'content-decay':
    'Query and page pairs that lost clicks against the previous period or the same period last year.',
  cannibalization:
    'Queries where more than one page of the site gets impressions, with each page’s share.',
  'traffic-drop':
    'Daily clicks and impressions checked for sudden changes in the last days, with Google updates whose dates overlap. Overlap is timing only, not cause.',
} as const

export type ReportId = keyof typeof REPORTS

// Reports whose top URLs are checked live on every run: status, redirect,
// title, description, H1, canonical and robots. Same-site redirects are then
// merged into their targets.
const PAGE_CHECKS = new Set<ReportId>([
  'quick-wins',
  'low-ctr',
  'striking-distance',
  'second-page',
  'content-decay',
  'cannibalization',
])

// The report to run next when it helps. Agents follow these; nothing else.
const NEXT: Record<ReportId, string> = {
  'site-overview':
    'Next: content-decay for pages that lost clicks, quick-wins and low-ctr for click-through rate, traffic-drop for a sudden change.',
  'quick-wins':
    'Next: seo_search_console with a page filter for one page’s queries; low-ctr for the top positions.',
  'low-ctr':
    'Next: quick-wins for positions 4 to 10; seo_research serp to see who else ranks.',
  'striking-distance':
    'Next: second-page to see the same pages by page; seo_research keyword_metrics for search volume.',
  'second-page':
    'Next: seo_search_console with a page filter for one page’s queries.',
  'content-decay':
    'Next: seo_inspect_url for lost pages; seo_search_console with a page filter to see which queries moved.',
  cannibalization:
    'Next: seo_inspect_url on the competing URLs to see Google’s chosen canonical.',
  'traffic-drop':
    'Next: site-overview for the period totals and the pages and queries that moved.',
}

export const FACTS_ONLY =
  'These are facts from Search Console, not instructions. Show the person what matters, ask what they want to change, and only edit pages with their approval.'

const ADVICE_KEYS =
  /^(recommendations?|actions?|advice|suggested[A-Z]\w*|nextSteps?)$/

// Removes advice fields at every depth.
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

export function dateWindow(
  input: { start_date?: string; end_date?: string },
  fallbackDays: number,
): { startDate: string; endDate: string } {
  if (input.start_date || input.end_date) {
    if (
      !input.start_date ||
      !input.end_date ||
      input.start_date > input.end_date
    ) {
      throw new ToolError(
        'INVALID_INPUT',
        'Send start_date and end_date together, in order.',
      )
    }
    return { startDate: input.start_date, endDate: input.end_date }
  }
  return finalGscDateRange(fallbackDays)
}

// The CLI's Search Console reader, backed by the caller's Google token. When
// verify found same-site redirects, rows for a redirect source are merged
// into its target so both count as one page.
function reader(
  google: string,
  redirects: Map<string, string> = new Map(),
): SearchAnalyticsQuery {
  return async (site, body) => {
    const { maxRows, rowLimit, startRow: _startRow, ...query } = body
    const result = await searchAnalytics(
      google,
      site,
      { ...query, dimensions: query.dimensions ?? [] },
      maxRows ?? rowLimit ?? MAX_ROWS,
    )
    const pageAt = (query.dimensions ?? []).indexOf('page')
    const rows =
      pageAt < 0 || redirects.size === 0
        ? result.rows
        : mergeRows(
            result.rows.map((row) => {
              const target = redirects.get(row.keys[pageAt] ?? '')
              if (!target) return row
              const keys = [...row.keys]
              keys[pageAt] = target
              return { ...row, keys }
            }),
          )
    return { rows, calls: result.calls, rowsFetched: result.rows.length }
  }
}

type Row = Awaited<ReturnType<SearchAnalyticsQuery>>['rows'][number]

// Rows with the same keys become one: clicks and impressions add up, and
// position is weighted by impressions.
function mergeRows(rows: Row[]): Row[] {
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

async function googleUpdates(window?: { start: string; end: string }) {
  if (!window) return []
  const incidents = await fetch(
    'https://status.search.google.com/incidents.json',
  )
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
  if (!Array.isArray(incidents))
    return 'Google Search Status could not be read.'
  return findOverlappingSearchUpdates({
    updates: searchUpdatesFromIncidents(incidents, {
      product: 'Ranking',
      limit: 50,
    }),
    startDate: window.start,
    endDate: window.end,
    paddingDays: 3,
  })
}

const DEFAULT_DAYS: Record<ReportId, number> = {
  'site-overview': 28,
  'quick-wins': 28,
  'low-ctr': 28,
  'striking-distance': 28,
  'second-page': 28,
  'content-decay': 28,
  cannibalization: 28,
  'traffic-drop': 90,
}

export function earlierRange(
  range: { startDate: string; endDate: string },
  comparison: 'previous-period' | 'year-over-year',
): { startDate: string; endDate: string } {
  return decayComparisonRange(range, comparison)
}

const pct = (now: number, before: number) =>
  before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10

// Totals, devices, top pages and top queries, now against before.
async function siteOverview(
  read: SearchAnalyticsQuery,
  site: string,
  range: { startDate: string; endDate: string },
  comparison: 'previous-period' | 'year-over-year',
): Promise<Record<string, unknown>> {
  const before = earlierRange(range, comparison)
  const get = (dimensions: string[], window: typeof range, maxRows = 1000) =>
    read(site, {
      ...window,
      dimensions,
      type: 'web',
      dataState: 'final',
      maxRows,
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
    comparison,
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

// Runs the same report code as the CLI. Page checks that need a browser are
// off here; the verify option fetches pages directly instead.
async function build(
  google: string,
  site: string,
  report: ReportId,
  range: { startDate: string; endDate: string },
  redirects: Map<string, string>,
  input: {
    min_impressions?: number
    limit: number
    brand_terms?: string[]
    include_brand: boolean
    comparison: 'previous-period' | 'year-over-year'
  },
): Promise<Record<string, unknown>> {
  const dependencies = {
    searchAnalytics: reader(google, redirects),
    now: () => new Date(),
  }
  const common = {
    site,
    minImpressions: input.min_impressions,
    limit: Math.min(input.limit, 100),
    brandTerms: input.brand_terms,
    includeBrand: input.include_brand,
  }
  const explicit = { startDate: range.startDate, endDate: range.endDate }
  const run = {
    'site-overview': () =>
      siteOverview(dependencies.searchAnalytics, site, range, input.comparison),
    'quick-wins': () =>
      quickWinsReportWith(
        { ...common, ...explicit, verifyContent: false },
        dependencies,
      ),
    'low-ctr': () =>
      ctrUnderperformersReportWith({ ...common, ...explicit }, dependencies),
    'striking-distance': () =>
      strikingDistanceWith(
        { ...common, ...explicit, verifyContent: false },
        dependencies,
      ),
    'second-page': () =>
      secondPageWith(
        { ...common, ...explicit, verifyContent: false },
        dependencies,
      ),
    'content-decay': () =>
      decayingReportWith(
        { ...common, ...explicit, comparison: input.comparison },
        dependencies,
      ),
    cannibalization: async () => {
      const result = (await cannibalReportWith(
        { ...common, ...explicit },
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
        { site, ...explicit, recentDays: 7 },
        dependencies,
      )
      const first = result.anomalies[0]
      return {
        ...result,
        googleUpdates: await googleUpdates(
          first && { start: first.comparisonStart, end: first.comparisonEnd },
        ),
      }
    },
  }[report]
  return (await run()) as unknown as Record<string, unknown>
}

function overviewText(
  report: Record<string, unknown>,
  property: string,
  origin: string,
): string {
  const range = report.range as { startDate: string; endDate: string }
  const before = report.comparisonRange as {
    startDate: string
    endDate: string
  }
  const t = report.summary as Record<string, number | null>
  const change = (value: number | null) =>
    value === null ? 'n/a' : `${value > 0 ? '+' : ''}${value}%`
  const section = (name: string, key: 'page' | 'query') => {
    const group = report[`${key === 'page' ? 'pages' : 'queries'}`] as Record<
      string,
      Record<string, unknown>[]
    >
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
        ? `${title}:\n${table(rows.slice(0, 10), columns, origin)}`
        : ''
    return [
      part(`Top ${name} by clicks`, group.top),
      part(`Biggest ${name} click losses`, group.biggestLosses) ||
        `No ${name} lost clicks.`,
      part(`Biggest ${name} impression losses`, group.biggestImpressionLosses),
      part(`Biggest ${name} click gains`, group.biggestGains),
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  return [
    `site-overview on ${property}, ${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}.`,
    `Totals: clicks ${t.clicks} (was ${t.previousClicks}, ${change(t.clicksChangePct)}), impressions ${t.impressions} (was ${t.previousImpressions}, ${change(t.impressionsChangePct)}), CTR ${t.ctr} (was ${t.previousCtr}), average position ${t.position} (was ${t.previousPosition}).`,
    `Devices:\n${table(report.devices as Record<string, unknown>[], ['device', 'clicks', 'previousClicks', 'impressions', 'position'], null)}`,
    section('pages', 'page'),
    section('queries', 'query'),
    `Limits:\n${(report.caveats as string[]).map((line) => `- ${line}`).join('\n')}`,
    `More: seo_report with report "site-overview", site "${property}", detail "full" for every row.`,
  ].join('\n\n')
}

function listOfUpdates(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return null
  if (value.length === 0)
    return 'Google updates in the comparison window: none.'
  return `Google updates in the comparison window (timing only, not cause): ${value
    .map(
      (update: { name: string; start: string; end?: string }) =>
        `${update.name} (${update.start.slice(0, 10)} to ${update.end?.slice(0, 10) ?? 'ongoing'})`,
    )
    .join('; ')}.`
}

export const seoReport = defineTool({
  name: 'seo_report',
  title: 'Run a Search Console report',
  description: `Runs one report on a Search Console property and returns facts with their limits. Reports:\n${Object.entries(
    REPORTS,
  )
    .map(([id, text]) => `- ${id}: ${text}`)
    .join(
      '\n',
    )}\nStart with site-overview, then detail "summary" on the report you need.`,
  input: z.object({
    site: Site,
    report: z.enum(Object.keys(REPORTS) as [ReportId, ...ReportId[]]),
    ...DateWindow,
    ...Detail,
  }),
  async run(context, input) {
    const property = await resolveProperty(context.google, input.site)
    const range = dateWindow(input, DEFAULT_DAYS[input.report])
    // One way to run each report: brand terms, minimums and the comparison
    // period are automatic and shown in the output.
    const options = {
      limit: 100,
      include_brand: false,
      comparison: 'previous-period' as const,
    }
    let report = factsOnly(
      await build(
        context.google,
        property,
        input.report,
        range,
        new Map(),
        options,
      ),
    ) as Record<string, unknown>
    const origin = property.startsWith('sc-domain:')
      ? `https://${property.slice('sc-domain:'.length)}`
      : property.replace(/\/$/, '')
    let checked: Awaited<ReturnType<typeof pageFacts>> = []
    const merged: string[] = []
    if (PAGE_CHECKS.has(input.report)) {
      const list = Object.values(report).find(
        (value) => Array.isArray(value) && value.length > 0,
      ) as unknown[] | undefined
      checked = await pageFacts(
        reportUrls(
          (report.items as unknown[] | undefined) ??
            (report.anomalies as unknown[] | undefined) ??
            list ??
            [],
          origin,
        ),
      )
      const redirects = new Map<string, string>()
      for (const page of checked) {
        if (!page.redirects_to) continue
        if (new URL(page.redirects_to).host !== new URL(page.url).host) continue
        redirects.set(page.url, page.redirects_to.replace(/#.*$/, ''))
        merged.push(`${page.url} → ${page.redirects_to}`)
      }
      if (redirects.size) {
        report = factsOnly(
          await build(
            context.google,
            property,
            input.report,
            range,
            redirects,
            options,
          ),
        ) as Record<string, unknown>
      }
      report.pageChecks = checked
    }
    const notes: string[] = []
    const brand = report.brand as
      | { terms?: string[]; excluded?: { term: string; reason?: string }[] }
      | undefined
    if (brand?.terms) {
      notes.push(
        `Brand terms left out: ${brand.terms.join(', ') || 'none'}${
          brand.excluded?.length
            ? `. Not treated as brand: ${brand.excluded.map((item) => item.term).join(', ')}`
            : ''
        }.`,
      )
    }
    const updates = listOfUpdates(report.googleUpdates)
    if (updates) notes.push(updates)
    if (checked.length) {
      notes.push(
        `Live page checks (${checked.length} URLs, fetched now, no redirects followed):\n${table(
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
        )}`,
      )
    }
    if (merged.length) {
      notes.push(
        `Redirect sources merged into their targets, so each pair counts as one page in this report: ${merged.join('; ')}.`,
      )
    }
    if (input.report === 'site-overview' && input.detail !== 'full') {
      return `${overviewText(report, property, origin)}\n\n${NEXT[input.report]}\n\n${FACTS_ONLY}`
    }
    const call = (detail: DetailLevel, offset?: number) =>
      `seo_report with report "${input.report}", site "${property}", detail "${detail}"${offset ? `, offset ${offset}` : ''}`
    const shown = presentReport({
      report,
      headline: [
        `${input.report} on ${property}.`,
        typeof report.verdict === 'string' ? report.verdict : '',
      ]
        .filter(Boolean)
        .join(' '),
      label: input.report,
      range:
        input.report === 'site-overview' || input.report === 'content-decay'
          ? `${range.startDate} to ${range.endDate} against ${earlierRange(range, 'previous-period').startDate} to ${earlierRange(range, 'previous-period').endDate}`
          : `${range.startDate} to ${range.endDate}`,
      notes,
      origin,
      detail: input.detail,
      offset: input.offset,
      limit: PAGE_SIZE,
      more: call,
    })
    return `${shown.text}\n\n${NEXT[input.report]}\n\n${FACTS_ONLY}`
  },
})
