import { latestFinalGscDate, shiftIsoDate } from '../gsc/dates.js'
import { analyticsBeside } from './analytics-site.js'
import { CLI_LINK } from './bing.js'
import { temporaryRedirectNote } from './page-facts.js'
import type { Detail } from './present.js'
import { table } from './present.js'
import { overviewText, pageFactsTable, siteOverview } from './report.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import {
  type DateInput,
  dateWindow,
  earlierRange,
  FACTS_ONLY,
  googleUpdates,
  listOfUpdates,
  originOf,
  sharedReader,
} from './shared.js'
import {
  type CommandDeps,
  CommandError,
  type CommandResult,
  type IndexStatus,
  type PageMarkdown,
} from './types.js'

// One page, a before and after comparison, and pages that lost their
// clicks. Each reads Search Console and checks pages live.

type Row = Record<string, unknown>

// Google's index status from a URL Inspection API response.
export function indexStatusFrom(result: unknown): IndexStatus {
  const status = ((
    result as { inspectionResult?: { indexStatusResult?: Row } } | null
  )?.inspectionResult?.indexStatusResult ??
    (result as { indexStatusResult?: Row } | null)?.indexStatusResult ??
    {}) as Row
  const text = (value: unknown) => (typeof value === 'string' ? value : null)
  return {
    verdict: text(status.verdict),
    coverage: text(status.coverageState),
    indexing: text(status.indexingState),
    last_crawl: text(status.lastCrawlTime),
    google_canonical: text(status.googleCanonical),
    user_canonical: text(status.userCanonical),
  }
}

export type PageInput = DateInput & {
  site: string
  url: string
  detail?: Detail
  offset?: number
}

export async function runPage(
  input: PageInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  const range = dateWindow(input, 28)
  const before = earlierRange(range)
  const query = (window: typeof range) =>
    deps.searchAnalytics(input.site, {
      ...window,
      dimensions: ['query'],
      type: 'web',
      maxRows: 5000,
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [
            { dimension: 'page', operator: 'equals', expression: input.url },
          ],
        },
      ],
    })
  const full = input.detail === 'full'
  const [[facts], indexed, now, then, markdown] = await Promise.all([
    deps.checkPages([input.url]),
    deps.inspect(input.site, input.url),
    query(range),
    query(before),
    full && deps.pageMarkdown
      ? deps.pageMarkdown(input.url).catch(
          (error: unknown): PageMarkdown => ({
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      : null,
  ])
  const old = new Map(then.rows.map((row) => [row.keys[0], row]))
  const seen = new Set<string>()
  const rows: Row[] = now.rows.map((row) => {
    seen.add(row.keys[0] ?? '')
    const earlier = old.get(row.keys[0])
    return {
      query: row.keys[0],
      clicks: row.clicks,
      previous_clicks: earlier?.clicks ?? 0,
      clicks_change: row.clicks - (earlier?.clicks ?? 0),
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      previous_position: earlier?.position ?? null,
    }
  })
  for (const row of then.rows) {
    if (seen.has(row.keys[0] ?? '')) continue
    rows.push({
      query: row.keys[0],
      clicks: 0,
      previous_clicks: row.clicks,
      clicks_change: -row.clicks,
      impressions: 0,
      ctr: 0,
      position: null,
      previous_position: row.position,
    })
  }
  rows.sort(
    (a, b) =>
      Number(b.clicks) - Number(a.clicks) ||
      Number(b.impressions) - Number(a.impressions),
  )
  const sum = (list: typeof now.rows, key: 'clicks' | 'impressions') =>
    list.reduce((total, row) => total + row[key], 0)
  const offset = input.offset ?? 0
  const text = rowsText({
    title: `${input.url} in ${input.site}, ${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}.`,
    notes: [
      `Live page (fetched now, no redirects followed):\n${facts ? pageFactsTable([facts], null) : 'Not fetched.'}`,
      indexed
        ? `Google index status:\n${table([indexed], Object.keys(indexed), null)}`
        : 'Google index status: not available for this URL.',
      `Query totals: clicks ${sum(now.rows, 'clicks')} (was ${sum(then.rows, 'clicks')}), impressions ${sum(now.rows, 'impressions')} (was ${sum(then.rows, 'impressions')}). Search Console hides rare queries, so these can be lower than the page total.`,
      deps.pageMarkdown
        ? `Main content as Markdown: ${deps.call('page', { url: input.url, detail: 'full' })}.`
        : `Main content as Markdown: only in the CLI and the local MCP server, with \`npx -y seo page --url ${input.url} --detail full\`.`,
    ],
    rows,
    offset,
    limit: PAGE_SIZE,
    detail: input.detail ?? 'summary',
    more: (next) =>
      deps.call('page', { url: input.url, detail: 'rows', offset: next }),
  })
  return {
    text: [
      text,
      ...(full ? [markdownText(markdown, input.url)] : []),
      `Next: ${deps.call('research')} serp with the top query to see who else ranks.`,
      FACTS_ONLY,
    ].join('\n\n'),
    data: {
      url: input.url,
      range,
      comparisonRange: before,
      page: facts ?? null,
      index: indexed,
      totalQueries: rows.length,
      queries: rows.slice(offset, offset + PAGE_SIZE),
      ...(full ? { markdown } : {}),
    },
  }
}

// The page's main content, or why it is missing. A surface without the
// extraction packages (the hosted server) sends agents to the CLI.
function markdownText(markdown: PageMarkdown | null, url: string): string {
  if (!markdown) {
    return `Main content as Markdown: not on this server; it runs in the CLI and the local MCP server. ${CLI_LINK} Then run \`npx -y seo page --url ${url} --detail full\`.`
  }
  if ('error' in markdown) {
    return `Main content as Markdown: the page could not be read (${markdown.error}).`
  }
  if (!markdown.markdown) {
    return 'Main content as Markdown: the page has no main content to read.'
  }
  const cut = markdown.truncated
    ? `, cut to ${markdown.markdown.length.toLocaleString('en-US')} of ${markdown.characters.toLocaleString('en-US')} characters`
    : ''
  return `Main content as Markdown (live page${cut}):\n\n${markdown.markdown}`
}

export type CompareInput = {
  site: string
  // The first day after the change, YYYY-MM-DD.
  date: string
  // Only pages whose URL contains this text.
  pages?: string
}

export async function runCompare(
  input: CompareInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new CommandError('INVALID_INPUT', 'The date must be YYYY-MM-DD.')
  }
  const last = latestFinalGscDate(deps.now?.() ?? new Date())
  const daysAfter =
    Math.round((Date.parse(last) - Date.parse(input.date)) / 86_400_000) + 1
  if (daysAfter < 3) {
    throw new CommandError(
      'INVALID_INPUT',
      `Search Console has final data to ${last}. Use a date at least 3 days before that.`,
    )
  }
  const days = Math.min(28, daysAfter)
  const after = {
    startDate: input.date,
    endDate: shiftIsoDate(input.date, days - 1),
  }
  const before = {
    startDate: shiftIsoDate(input.date, -days),
    endDate: shiftIsoDate(input.date, -1),
  }
  const [report, updates, analytics] = await Promise.all([
    siteOverview(
      sharedReader(deps.searchAnalytics),
      input.site,
      after,
      before,
      input.pages,
    ),
    googleUpdates({ start: before.startDate, end: after.endDate }),
    analyticsBeside(deps.analytics, input.site, after, before, input.pages),
  ])
  return {
    text: [
      overviewText(
        report,
        `Compare on ${input.site}: ${days} days after ${input.date}`,
        originOf(input.site),
        10,
      ),
      analytics?.text,
      listOfUpdates(updates),
      `Next: ${deps.call('page')} for a page that moved.`,
      FACTS_ONLY,
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: {
      ...report,
      ...(analytics ? { analytics: analytics.data } : {}),
      googleUpdates: updates,
    },
  }
}

const LOST_SHARE = 0.2
const MIN_LOST = 3
const CHECKED = 20
const INSPECTED = 10
// Most of the inspected pages, and at least this many, out of the index.
const SITE_WIDE_MIN = 5

// Counts of URL Inspection results, and a line when most inspected pages
// are out of Google's index while the home page is in it. A pattern to
// check, not a cause.
export function indexSummary(
  inspected: (IndexStatus | null)[],
  home: { url: string; status: IndexStatus | null } | null,
) {
  const known = inspected.filter(
    (item): item is IndexStatus => item?.verdict != null,
  )
  const indexed = known.filter((item) => item.verdict === 'PASS').length
  const coverage = new Map<string, number>()
  for (const item of known) {
    if (item.verdict === 'PASS') continue
    const state = item.coverage ?? item.verdict ?? 'unknown'
    coverage.set(state, (coverage.get(state) ?? 0) + 1)
  }
  const notIndexed = known.length - indexed
  const homeIndexed = home?.status?.verdict
    ? home.status.verdict === 'PASS'
    : null
  const siteWide =
    notIndexed >= SITE_WIDE_MIN && notIndexed * 2 > known.length && homeIndexed
  const byCoverage = [...coverage]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([state, count]) => ({ state, count }))
  const lines = known.length
    ? [
        `Index status of the ${known.length} inspected pages: ${indexed} indexed, ${notIndexed} not indexed${byCoverage.length ? ` (${byCoverage.map((item) => `${item.count} ${item.state}`).join('; ')})` : ''}.${home && homeIndexed !== null ? ` Home page ${home.url}: ${homeIndexed ? 'indexed' : `not indexed (${home.status?.coverage ?? home.status?.verdict})`}.` : ''}`,
        siteWide
          ? `Site-wide pattern: ${notIndexed} of ${known.length} inspected pages are not in Google's index, but the home page is. This points to the whole site, not single pages. It does not show the cause.`
          : null,
      ]
    : []
  return {
    text: lines.filter(Boolean).join('\n'),
    data: {
      inspected: known.length,
      indexed,
      notIndexed,
      byCoverage,
      homePage:
        home && homeIndexed !== null
          ? { url: home.url, indexed: homeIndexed }
          : null,
      siteWide: Boolean(siteWide),
    },
  }
}

export const LOST_PAGES_RULE = `Pages that had at least ${MIN_LOST} clicks in the previous 28 days and kept ${LOST_SHARE * 100}% or less of them in the last 28 days, with a live check of the top ${CHECKED} and Google’s index status for the top ${INSPECTED} and the home page.`

export async function runLostPages(
  input: DateInput & { site: string },
  deps: CommandDeps,
): Promise<CommandResult> {
  const range = dateWindow(input, 28)
  const before = earlierRange(range)
  const read = (window: typeof range) =>
    deps.searchAnalytics(input.site, {
      ...window,
      dimensions: ['page'],
      type: 'web',
      maxRows: 25_000,
    })
  const [now, then] = await Promise.all([read(range), read(before)])
  const current = new Map(now.rows.map((row) => [row.keys[0], row.clicks]))
  const lost = then.rows
    .filter((row) => row.clicks >= MIN_LOST && !row.keys[0]?.includes('#'))
    .map((row) => ({
      url: row.keys[0] ?? '',
      previous_clicks: row.clicks,
      clicks: current.get(row.keys[0]) ?? 0,
    }))
    .filter((row) => row.clicks <= row.previous_clicks * LOST_SHARE)
    .sort(
      (a, b) =>
        b.previous_clicks - b.clicks - (a.previous_clicks - a.clicks) ||
        a.url.localeCompare(b.url),
    )
  const top = lost.slice(0, CHECKED)
  const homeUrl = top[0] ? `${new URL(top[0].url).origin}/` : null
  const [facts, indexed, homeStatus] = await Promise.all([
    deps.checkPages(top.map((row) => row.url)),
    Promise.all(
      top.slice(0, INSPECTED).map((row) => deps.inspect(input.site, row.url)),
    ),
    homeUrl && !top.slice(0, INSPECTED).some((row) => row.url === homeUrl)
      ? deps.inspect(input.site, homeUrl).catch(() => null)
      : null,
  ])
  const homeIndex = top
    .slice(0, INSPECTED)
    .findIndex((row) => row.url === homeUrl)
  const summary = indexSummary(
    homeIndex >= 0
      ? indexed.filter((_, index) => index !== homeIndex)
      : indexed,
    homeUrl
      ? {
          url: homeUrl,
          status: homeIndex >= 0 ? (indexed[homeIndex] ?? null) : homeStatus,
        }
      : null,
  )
  const rows = top.map((row, index) => ({
    ...row,
    status: facts[index]?.status ?? null,
    redirects_to: facts[index]?.redirects_to ?? null,
    robots: facts[index]?.robots ?? null,
    canonical: facts[index]?.canonical ?? null,
    verdict: indexed[index]?.verdict ?? null,
    coverage: indexed[index]?.coverage ?? null,
    google_canonical: indexed[index]?.google_canonical ?? null,
  }))
  return {
    text: [
      `Pages that lost their clicks on ${input.site}: ${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}.`,
      `${lost.length} pages kept ${LOST_SHARE * 100}% or less of at least ${MIN_LOST} clicks${lost.length > CHECKED ? `; the top ${CHECKED} by clicks lost are shown` : ''}.`,
      rows.length
        ? table(rows, Object.keys(rows[0] ?? {}), originOf(input.site))
        : 'No pages lost their clicks.',
      summary.text,
      'Live checks are fetched now with no redirects followed. Index status is from URL Inspection; Google allows about 2,000 inspections a day per property.',
      temporaryRedirectNote(rows),
      `Next: ${deps.call('page')} for one URL; ${deps.call('report', { site: input.site, section: 'content-decay' })} for pages that lost part of their clicks.`,
      FACTS_ONLY,
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: {
      range,
      comparisonRange: before,
      rule: LOST_PAGES_RULE,
      lostPages: lost.length,
      index: summary.data,
      pages: rows,
    },
  }
}
