import {
  AI_REFERRAL_SOURCES,
  aiReferralSourceForValue,
} from '../analyze/ai-referrals-sources.js'
import {
  SIMPLE_ANALYTICS_LIMIT,
  SimpleAnalyticsError,
  type SimpleAnalyticsRow,
  simpleAnalyticsStats,
} from '../simple-analytics/api.js'
import { change } from './analytics-site.js'
import type { Detail } from './present.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { pct } from './shared.js'
import { CommandError, type CommandResult, type DateRange } from './types.js'

// Simple Analytics for one website, read with the person's saved API key:
// landing pages for seo_data, and both periods for seo compare. Numbers
// stay Simple Analytics' own: visitors (a pageview with no referrer or one
// from another site, which Simple Analytics also counts as a visit) and
// pageviews. Nothing here turns them into sessions, users or clicks.

export const SIMPLE_ANALYTICS_KEY = 'x-simpleanalytics-key'

export const simpleAnalyticsKey = (keys: Headers) =>
  keys.get(SIMPLE_ANALYTICS_KEY)?.trim() || null

// AI tools counted per period, most visitors first. A tool seen in both
// referrers and utm_source tags costs one more request per pair of them.
const MAX_AI_TOOLS = 5
// Referrer and utm_source pairs checked for overlap per AI tool.
const MAX_AI_PAIRS = 4
const TOP = 10
const DAY = 86_400_000
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)

// utm_source values AI tools write without a domain.
const BARE_AI: Record<string, string> = {
  chatgpt: 'chatgpt',
  openai: 'chatgpt',
  perplexity: 'perplexity',
  claude: 'claude',
  gemini: 'gemini',
  copilot: 'copilot',
  grok: 'grok',
  deepseek: 'deepseek',
}

const aiTool = (value: string) =>
  aiReferralSourceForValue(value) ??
  AI_REFERRAL_SOURCES.find(
    (source) => source.id === BARE_AI[value.trim().toLowerCase()],
  )

// The hostnames a site can be in Simple Analytics: the bare host, then
// with www.
function hostsOf(site: string): string[] {
  const text = site
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/u, '')
  let host: string
  try {
    host = new URL(text.includes('://') ? text : `https://${text}`).hostname
  } catch {
    host = text
  }
  const bare = host.replace(/^www\./u, '')
  return [bare, `www.${bare}`]
}

type AiCount = {
  tool: string
  visitors: number
  // The referrer and utm_source values counted for it.
  referrers: string[]
  utmSources: string[]
  // False when the tool had more referrer and utm_source pairs than were
  // checked, so a visitor with both can count twice.
  exact: boolean
}

export type SimpleAnalyticsPeriod = {
  hostname: string
  timezone: string | null
  range: DateRange
  visitors: number
  pageviews: number
  pages: SimpleAnalyticsRow[]
  referrers: SimpleAnalyticsRow[]
  utmSources: SimpleAnalyticsRow[]
  ai: { visitors: number; tools: AiCount[]; notCounted: number }
  // Lists that came back at Simple Analytics' row limit, so rows past it
  // are missing, not zero.
  capped: { pages: boolean; referrers: boolean; utmSources: boolean }
}

const byVisitors = (a: SimpleAnalyticsRow, b: SimpleAnalyticsRow) =>
  b.visitors - a.visitors ||
  b.pageviews - a.pageviews ||
  (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)

async function readPeriod(
  key: string,
  hostname: string,
  range: DateRange,
  filters: Record<string, string>,
  withPages: boolean,
): Promise<SimpleAnalyticsPeriod> {
  const stats = await simpleAnalyticsStats(
    key,
    hostname,
    range,
    [
      'pageviews',
      'visitors',
      ...(withPages ? ['pages'] : []),
      'referrers',
      'utm_sources',
    ],
    filters,
  )
  const referrers = [...stats.referrers].sort(byVisitors)
  const utmSources = [...stats.utm_sources].sort(byVisitors)
  const tools = new Map<
    string,
    { label: string; refs: SimpleAnalyticsRow[]; utms: SimpleAnalyticsRow[] }
  >()
  const add = (rows: SimpleAnalyticsRow[], side: 'refs' | 'utms') => {
    for (const row of rows) {
      const tool = aiTool(row.value)
      if (!tool || !row.visitors) continue
      const entry = tools.get(tool.id) ?? {
        label: tool.label,
        refs: [],
        utms: [],
      }
      entry[side].push(row)
      tools.set(tool.id, entry)
    }
  }
  add(referrers, 'refs')
  add(utmSources, 'utms')
  const sum = (rows: SimpleAnalyticsRow[]) =>
    rows.reduce((total, row) => total + row.visitors, 0)
  const ranked = [...tools.values()]
    .map((tool) => ({ ...tool, total: sum(tool.refs) + sum(tool.utms) }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    )
  // Referrer and utm_source counts overlap: a visitor from chatgpt.com
  // with utm_source=chatgpt.com is in both. A visitor has one referrer and
  // one utm_source, so each referrer and utm_source pair's overlap is
  // separate, and taking off every pair's overlap counts each visitor
  // once. The pairs with the most visitors are checked first, up to
  // MAX_AI_PAIRS a tool.
  const counted = await Promise.all(
    ranked.slice(0, MAX_AI_TOOLS).map(async (tool): Promise<AiCount> => {
      const pairs = tool.refs
        .flatMap((ref) => tool.utms.map((utm) => ({ ref, utm })))
        .sort(
          (a, b) =>
            Math.min(b.ref.visitors, b.utm.visitors) -
              Math.min(a.ref.visitors, a.utm.visitors) ||
            (a.ref.value + a.utm.value < b.ref.value + b.utm.value ? -1 : 1),
        )
      const checked = pairs.slice(0, MAX_AI_PAIRS)
      const overlaps = await Promise.all(
        checked.map(
          async ({ ref, utm }) =>
            (
              await simpleAnalyticsStats(key, hostname, range, ['visitors'], {
                ...filters,
                referrer: ref.value,
                utm_source: utm.value,
              })
            ).visitors ?? 0,
        ),
      )
      return {
        tool: tool.label,
        visitors: tool.total - overlaps.reduce((sum, n) => sum + n, 0),
        referrers: tool.refs.map((row) => row.value),
        utmSources: tool.utms.map((row) => row.value),
        exact: pairs.length <= MAX_AI_PAIRS,
      }
    }),
  )
  const full = (rows: unknown[]) => rows.length >= SIMPLE_ANALYTICS_LIMIT
  return {
    hostname: stats.hostname,
    timezone: stats.timezone,
    range,
    visitors: stats.visitors ?? 0,
    pageviews: stats.pageviews ?? 0,
    pages: [...stats.pages].sort(byVisitors),
    referrers,
    utmSources,
    ai: {
      visitors: counted.reduce((total, tool) => total + tool.visitors, 0),
      tools: counted,
      notCounted: Math.max(0, ranked.length - MAX_AI_TOOLS),
    },
    capped: {
      pages: full(stats.pages),
      referrers: full(stats.referrers),
      utmSources: full(stats.utm_sources),
    },
  }
}

// The first period of a site whose hostname Simple Analytics knows, bare
// or with www. Null when it knows neither.
async function firstPeriod(
  site: string,
  read: (hostname: string) => Promise<SimpleAnalyticsPeriod>,
): Promise<SimpleAnalyticsPeriod | null> {
  for (const hostname of hostsOf(site)) {
    try {
      return await read(hostname)
    } catch (error) {
      if (error instanceof SimpleAnalyticsError && error.code === 'not_found')
        continue
      throw error
    }
  }
  return null
}

// Simple Analytics' pages filter takes a path prefix, not "contains".
function pageFilter(pages?: string): Record<string, string> {
  return pages?.startsWith('/')
    ? { pages: `${pages.replace(/\*+$/u, '')}*` }
    : {}
}

const top = (rows: SimpleAnalyticsRow[]) =>
  rows
    .slice(0, TOP)
    .map((row) => `${row.value} ${row.visitors}`)
    .join('; ')

const aiNotes = (period: SimpleAnalyticsPeriod) =>
  [
    period.ai.tools.some((tool) => !tool.exact)
      ? `${period.ai.tools
          .filter((tool) => !tool.exact)
          .map((tool) => tool.tool)
          .join(
            ', ',
          )} came in more referrer and utm_source pairs than were checked, so a visitor with both can count twice there.`
      : '',
    period.ai.notCounted
      ? `${period.ai.notCounted} more AI ${period.ai.notCounted === 1 ? 'tool is' : 'tools are'} left out of this count.`
      : '',
    period.capped.referrers || period.capped.utmSources
      ? `A referrer or utm_source list reached Simple Analytics' ${SIMPLE_ANALYTICS_LIMIT}-row limit, so AI tools past it are missing, not zero.`
      : '',
  ].filter(Boolean)

const VISITORS_NOTE =
  'Visitors are Simple Analytics’ own count: a pageview with no referrer or one from another site, which it also counts as a visit. They are not Google Analytics sessions or users, or Search Console clicks.'

const zoneNote = (period: SimpleAnalyticsPeriod) =>
  period.timezone
    ? `Days are in the website’s time zone, ${period.timezone}.`
    : ''

const failure = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

// Before and after a date, for seo compare. Null when no key is saved or
// Simple Analytics has no website for the site; a failure is named instead
// of stopping the comparison.
export async function simpleAnalyticsBeside(
  keys: Headers | undefined,
  site: string,
  range: DateRange,
  before: DateRange,
  pages?: string,
): Promise<{ text: string; data: unknown } | null> {
  const key = keys ? simpleAnalyticsKey(keys) : null
  if (!key) return null
  const filters = pageFilter(pages)
  try {
    const now = await firstPeriod(site, (hostname) =>
      readPeriod(key, hostname, range, filters, false),
    )
    if (!now) return null
    const then = await readPeriod(key, now.hostname, before, filters, false)
    const merged = <T extends { visitors: number }>(
      a: T[],
      b: T[],
      name: (row: T) => string,
    ) => {
      const rows = new Map<
        string,
        { visitors: number; previousVisitors: number }
      >()
      for (const row of a) {
        const entry = rows.get(name(row)) ?? {
          visitors: 0,
          previousVisitors: 0,
        }
        entry.visitors += row.visitors
        rows.set(name(row), entry)
      }
      for (const row of b) {
        const entry = rows.get(name(row)) ?? {
          visitors: 0,
          previousVisitors: 0,
        }
        entry.previousVisitors += row.visitors
        rows.set(name(row), entry)
      }
      return [...rows]
        .map(([key, entry]) => ({ name: key, ...entry }))
        .sort(
          (x, y) =>
            y.visitors - x.visitors ||
            y.previousVisitors - x.previousVisitors ||
            (x.name < y.name ? -1 : x.name > y.name ? 1 : 0),
        )
    }
    const was = (
      rows: { name: string; visitors: number; previousVisitors: number }[],
    ) =>
      rows
        .slice(0, TOP)
        .map(
          (row) => `${row.name} ${row.visitors} (was ${row.previousVisitors})`,
        )
        .join(', ')
    const referrers = merged(now.referrers, then.referrers, (row) => row.value)
    const tools = merged(now.ai.tools, then.ai.tools, (row) => row.tool)
    const scope = filters.pages
      ? `, pages whose path starts with "${pages}"`
      : ''
    const notes = [
      VISITORS_NOTE,
      zoneNote(now),
      pages && !filters.pages
        ? `Simple Analytics narrows only to paths that start with some text, so these numbers cover the whole site, not pages containing "${pages}".`
        : '',
      now.capped.referrers || then.capped.referrers
        ? `The referrer list reached Simple Analytics' ${SIMPLE_ANALYTICS_LIMIT}-row limit, so referrers past it are missing, not zero.`
        : '',
    ].filter(Boolean)
    const text = [
      `Simple Analytics, website ${now.hostname}${scope}: visitors ${now.visitors} (was ${then.visitors}, ${change(pct(now.visitors, then.visitors))}), pageviews ${now.pageviews} (was ${then.pageviews}, ${change(pct(now.pageviews, then.pageviews))}).`,
      referrers.length ? `Top referrers (visitors): ${was(referrers)}.` : '',
      ...notes,
    ]
      .filter(Boolean)
      .join(' ')
    const ai = [
      now.ai.visitors || then.ai.visitors
        ? `Visitors from AI assistants in Simple Analytics (referrers and utm_source tags, a visitor with both counted once): ${now.ai.visitors} (was ${then.ai.visitors}, ${change(pct(now.ai.visitors, then.ai.visitors))}). By tool: ${was(tools)}.`
        : now.capped.referrers || now.capped.utmSources
          ? 'Visitors from AI assistants in Simple Analytics: none among the referrers and utm_source tags it listed, but a list reached its row limit, so this is unknown, not zero.'
          : 'Visitors from AI assistants in Simple Analytics: none in either period.',
      ...new Set([...aiNotes(now), ...aiNotes(then)]),
      'Only visits that pass a referrer or utm_source count; AI apps that send neither show as direct.',
    ].join(' ')
    return {
      text: `${text}\n\n${ai}`,
      data: {
        hostname: now.hostname,
        timezone: now.timezone,
        ...(filters.pages ? { pathStartsWith: pages } : {}),
        metric: 'visitors',
        visitors: now.visitors,
        previousVisitors: then.visitors,
        visitorsChangePct: pct(now.visitors, then.visitors),
        pageviews: now.pageviews,
        previousPageviews: then.pageviews,
        referrers: referrers.map(({ name, ...row }) => ({
          referrer: name,
          ...row,
        })),
        aiAssistants: {
          visitors: now.ai.visitors,
          previousVisitors: then.ai.visitors,
          visitorsChangePct: pct(now.ai.visitors, then.ai.visitors),
          byTool: tools.map(({ name, ...row }) => ({ tool: name, ...row })),
          tools: now.ai.tools,
          previousTools: then.ai.tools,
        },
        capped: { now: now.capped, before: then.capped },
        notes,
      },
    }
  } catch (error) {
    return {
      text: `Simple Analytics: could not be read. ${failure(error)}`,
      data: { error: failure(error) },
    }
  }
}

export type SimpleAnalyticsRowsInput = {
  // The site, as a domain or URL.
  site: string
  startDate?: string
  endDate?: string
  detail?: Detail
  offset?: number
}

// Landing pages for seo_data: each page's visitors, which are the visits
// that started on it, with referrers, utm_source tags and AI tools. The
// default is the last 28 full days.
export async function runSimpleAnalyticsRows(
  input: SimpleAnalyticsRowsInput,
  keys: Headers,
  options: { connect: string; call: (offset: number) => string },
): Promise<CommandResult> {
  const key = simpleAnalyticsKey(keys)
  if (!key) {
    throw new CommandError(
      'NO_KEY',
      `No Simple Analytics API key is saved. Add one: ${options.connect}`,
    )
  }
  let range: DateRange
  if (!input.startDate && !input.endDate) {
    const end = Date.now() - DAY
    range = { startDate: isoDay(end - 27 * DAY), endDate: isoDay(end) }
  } else if (
    !input.startDate ||
    !input.endDate ||
    !(Date.parse(input.startDate) <= Date.parse(input.endDate))
  ) {
    throw new CommandError(
      'INVALID_INPUT',
      'Send a start date and an end date together, in order.',
    )
  } else {
    range = { startDate: input.startDate, endDate: input.endDate }
  }
  let period: SimpleAnalyticsPeriod | null
  try {
    period = await firstPeriod(input.site, (hostname) =>
      readPeriod(key, hostname, range, {}, true),
    )
  } catch (error) {
    throw new CommandError(
      error instanceof SimpleAnalyticsError && error.code === 'auth'
        ? 'NO_ACCESS'
        : 'PROVIDER_ERROR',
      error instanceof SimpleAnalyticsError && error.code === 'auth'
        ? `${error.message} Save it again: ${options.connect}`
        : failure(error),
    )
  }
  if (!period) {
    throw new CommandError(
      'NO_ACCESS',
      `Simple Analytics has no website ${hostsOf(input.site).join(' or ')} for this API key.`,
    )
  }
  const offset = input.offset ?? 0
  const rows = period.pages
    .filter((row) => row.visitors > 0)
    .map((row) => ({
      page: row.value,
      visitors: row.visitors,
      pageviews: row.pageviews,
    }))
  const notes = [
    `Visitors ${period.visitors}, pageviews ${period.pageviews} in all. A page’s visitors are the visits that started on it; pages with pageviews but no visitors are left out.`,
    VISITORS_NOTE,
    zoneNote(period),
    period.referrers.length
      ? `Referrers (visitors): ${top(period.referrers)}.`
      : 'Referrers: none in this range.',
    period.utmSources.length
      ? `utm_source tags (visitors): ${top(period.utmSources)}.`
      : '',
    period.ai.visitors
      ? `Visitors from AI assistants (referrers and utm_source tags, a visitor with both counted once): ${period.ai.visitors}. By tool: ${period.ai.tools.map((tool) => `${tool.tool} ${tool.visitors}`).join(', ')}.`
      : 'Visitors from AI assistants: none among the referrers and utm_source tags listed.',
    ...aiNotes(period),
    period.capped.pages
      ? `Simple Analytics returned its ${SIMPLE_ANALYTICS_LIMIT}-row limit of pages; pages past it are missing, not zero.`
      : '',
  ].filter(Boolean)
  return {
    text: rowsText({
      title: `Simple Analytics website ${period.hostname}: landing pages, ${range.startDate} to ${range.endDate}.`,
      rows,
      offset,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes,
      more: options.call,
    }),
    data: {
      hostname: period.hostname,
      timezone: period.timezone,
      range,
      metric: 'visitors',
      visitors: period.visitors,
      pageviews: period.pageviews,
      referrers: period.referrers.slice(0, PAGE_SIZE),
      utmSources: period.utmSources.slice(0, PAGE_SIZE),
      aiAssistants: { visitors: period.ai.visitors, tools: period.ai.tools },
      capped: period.capped.pages,
      total: rows.length,
      offset,
      rows: rows.slice(offset, offset + PAGE_SIZE),
    },
  }
}
