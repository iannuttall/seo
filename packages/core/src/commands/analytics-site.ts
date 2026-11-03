import { type Ga4WebStreamMatch, matchGa4WebStreams } from '../ga4/matching.js'
import {
  type GoogleFetch,
  listAnalyticsAccounts,
  listAnalyticsDataStreams,
  runAnalyticsReport,
} from '../google/api.js'
import { pct } from './shared.js'
import type { GoogleAccount } from './sites.js'
import type { DateRange } from './types.js'

// Google Analytics beside Search Console: the property whose web stream
// matches the site, and its sessions for the same dates. The property is
// found from the site, never asked for, and the output names it.

// How a surface reaches Google Analytics.
export type AnalyticsAccess = {
  accounts: () => Promise<GoogleAccount[]>
  signIn: string
}

// Properties whose web streams are read before giving up, at most this
// many at a time. Properties named like the site are read first.
const STREAM_CHECKS = 30
const AT_ONCE = 5
// Properties whose web streams match equally well and are read; the one
// with the most sessions is shown.
const TIED = 3

type Candidate = {
  account: string
  property: string
  propertyName: string
  google: GoogleFetch
}

type Found = {
  property: string
  name: string
  stream: string
  google: GoogleFetch
}

const hostOf = (site: string) => {
  const value = site.replace(/^sc-domain:/, '')
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname
  } catch {
    return value
  }
}

const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

// Properties named after the site first, then by property id.
function ranked(site: string, candidates: Candidate[]): Candidate[] {
  const host = hostOf(site).replace(/^www\./, '')
  const words = [plain(host), plain(host.split('.')[0] ?? '')].filter(
    (word) => word.length >= 3,
  )
  const named = (candidate: Candidate) =>
    words.some((word) => plain(candidate.propertyName).includes(word)) ? 0 : 1
  return [...candidates].sort(
    (a, b) =>
      named(a) - named(b) ||
      a.property.localeCompare(b.property, 'en', { numeric: true }),
  )
}

// The site's own host first, then the closest hostname.
function best(site: string, matches: Ga4WebStreamMatch[]): Ga4WebStreamMatch[] {
  const host = hostOf(site).replace(/^www\./, '')
  const score = (match: Ga4WebStreamMatch) =>
    match.hostname === host || match.hostname === `www.${host}` ? 0 : 1
  return [...matches].sort(
    (a, b) =>
      score(a) - score(b) ||
      a.hostname.length - b.hostname.length ||
      a.property.localeCompare(b.property, 'en', { numeric: true }),
  )
}

// One lookup per surface and site for a few minutes, so the overview line
// and the page sections' key events in one report share it, and a long
// running local server still sees a property added later.
const LOOKUP_MS = 5 * 60_000
const lookups = new WeakMap<
  AnalyticsAccess,
  Map<string, { at: number; found: Promise<Found[] | string> }>
>()

function findProperty(
  access: AnalyticsAccess,
  site: string,
): Promise<Found[] | string> {
  const bySite = lookups.get(access) ?? new Map()
  lookups.set(access, bySite)
  const kept = bySite.get(site)
  if (kept && Date.now() - kept.at < LOOKUP_MS) return kept.found
  const found = lookProperty(access, site)
  bySite.set(site, { at: Date.now(), found })
  // A failure is not kept, so the next call tries again.
  found.catch(() => bySite.delete(site))
  return found
}

async function lookProperty(
  access: AnalyticsAccess,
  site: string,
): Promise<Found[] | string> {
  const accounts = await access.accounts()
  const listed = await Promise.all(
    accounts.map((account) =>
      listAnalyticsAccounts(account.google, { signIn: access.signIn }).then(
        (summaries) => ({ account, summaries }),
        (error: unknown) =>
          error instanceof Error ? error : new Error(String(error)),
      ),
    ),
  )
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  for (const entry of listed) {
    if (entry instanceof Error) continue
    for (const summary of entry.summaries) {
      for (const item of summary.propertySummaries) {
        const property = item.property.replace(/^properties\//, '')
        if (seen.has(property) || !/^\d+$/.test(property)) continue
        seen.add(property)
        candidates.push({
          account: summary.account,
          property,
          propertyName: item.displayName ?? property,
          google: entry.account.google,
        })
      }
    }
  }
  if (!candidates.length) {
    const failed = listed.find((entry) => entry instanceof Error)
    return failed
      ? `could not be read. ${failed.message}`
      : 'the connected Google accounts cannot read any property.'
  }
  const order = ranked(site, candidates).slice(0, STREAM_CHECKS)
  let failures = 0
  for (let start = 0; start < order.length; start += AT_ONCE) {
    const batch = order.slice(start, start + AT_ONCE)
    const streams = await Promise.all(
      batch.map((candidate) =>
        listAnalyticsDataStreams(candidate.google, candidate.property, {
          signIn: access.signIn,
        }).catch(() => {
          failures += 1
          return []
        }),
      ),
    )
    const matches = best(
      site,
      batch.flatMap((candidate, index) =>
        matchGa4WebStreams(
          site,
          (streams[index] ?? []).map((stream) => ({ ...candidate, stream })),
        ),
      ),
    )
    const found = new Map<string, Found>()
    for (const match of matches) {
      const candidate = batch.find((item) => item.property === match.property)
      if (!candidate || found.has(match.property)) continue
      found.set(match.property, {
        property: match.property,
        name: match.propertyName,
        stream: match.defaultUri,
        google: candidate.google,
      })
    }
    if (found.size) return [...found.values()].slice(0, TIED)
  }
  const checked =
    order.length < candidates.length
      ? `the first ${order.length} of ${candidates.length} properties, named like the site first`
      : `${candidates.length} ${candidates.length === 1 ? 'property' : 'properties'}`
  return `no web stream matches ${site} in ${checked}${failures ? ` (${failures} could not be read)` : ''}.`
}

type Totals = { sessions: number; keyEvents: number }

type ReportRows = {
  dimensionHeaders?: { name: string }[]
  rows?: {
    dimensionValues?: { value?: string }[]
    metricValues?: { value?: string }[]
  }[]
  metadata?: {
    subjectToThresholding?: boolean
    dataLossFromOtherRow?: boolean
    timeZone?: string
  }
}

// Session sources that are AI assistants, as Google Analytics records them
// from the referrer or utm_source. A full match, so other sites that only
// contain these words do not count.
const AI_SOURCES = [
  'chatgpt.com',
  'chatgpt',
  'chat.openai.com',
  'perplexity.ai',
  'perplexity',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'copilot.com',
  'chat.deepseek.com',
  'meta.ai',
  'grok.com',
  'chat.mistral.ai',
  'you.com',
  'phind.com',
  'poe.com',
]
const AI_SOURCE_PATTERN = `(www\\.)?(${AI_SOURCES.map((source) => source.replaceAll('.', '\\.')).join('|')})`
// AI sources and their landing pages shown in the text.
const AI_ROWS = 5

const filter = (fieldName: string, value: string, matchType = 'EXACT') => ({
  filter: { fieldName, stringFilter: { matchType, value } },
})

// Sessions and key events by channel, and Organic Search sessions from
// Google alone, for both periods. With pages, only landing pages whose path
// contains that text.
async function totals(
  found: Found,
  access: AnalyticsAccess,
  range: DateRange,
  before: DateRange,
  pages?: string,
) {
  const read = (dimensions: string[], filters: object[]) =>
    runAnalyticsReport<ReportRows>(
      found.google,
      found.property,
      {
        dateRanges: [
          { ...range, name: 'now' },
          { ...before, name: 'before' },
        ],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
        ...(filters.length
          ? { dimensionFilter: { andGroup: { expressions: filters } } }
          : {}),
        limit: 100,
      },
      { signIn: access.signIn },
    )
  const onPages = pages ? [filter('landingPage', pages, 'CONTAINS')] : []
  const fromAi = [
    ...onPages,
    filter('sessionSource', AI_SOURCE_PATTERN, 'FULL_REGEXP'),
  ]
  const [channels, google, aiSources, aiPages, engines] = await Promise.all([
    read(['sessionDefaultChannelGroup'], onPages),
    read(
      [],
      [
        ...onPages,
        filter('sessionDefaultChannelGroup', 'Organic Search'),
        filter('sessionSource', 'google'),
      ],
    ),
    read(['sessionSource'], fromAi),
    read(['landingPage'], fromAi),
    read(
      ['sessionSource'],
      [...onPages, filter('sessionDefaultChannelGroup', 'Organic Search')],
    ),
  ])
  const sum = () => ({
    google: { sessions: 0, keyEvents: 0 } as Totals,
    organic: { sessions: 0, keyEvents: 0 } as Totals,
    all: { sessions: 0, keyEvents: 0 } as Totals,
  })
  const periods = { now: sum(), before: sum() }
  const each = (
    data: ReportRows,
    add: (period: ReturnType<typeof sum>, row: string, total: Totals) => void,
  ) => {
    const headers = data.dimensionHeaders?.map((header) => header.name) ?? []
    const periodAt = headers.indexOf('dateRange')
    for (const row of data.rows ?? []) {
      const values = row.dimensionValues ?? []
      const period =
        (periodAt >= 0 ? values[periodAt] : values.at(-1))?.value === 'before'
          ? periods.before
          : periods.now
      add(period, values[0]?.value ?? '', {
        sessions: Number(row.metricValues?.[0]?.value ?? 0),
        keyEvents: Number(row.metricValues?.[1]?.value ?? 0),
      })
    }
  }
  const plus = (into: Totals, row: Totals) => {
    into.sessions += row.sessions
    into.keyEvents += row.keyEvents
  }
  each(channels, (period, channel, row) => {
    plus(period.all, row)
    if (channel === 'Organic Search') plus(period.organic, row)
  })
  each(google, (period, _, row) => plus(period.google, row))
  // Sessions now and before for each AI source or landing page, most first.
  const byName = (data: ReportRows, key: 'source' | 'page') => {
    const rows = new Map<
      string,
      { now: number; before: number; keyEvents: number }
    >()
    const headers = data.dimensionHeaders?.map((header) => header.name) ?? []
    const periodAt = headers.indexOf('dateRange')
    for (const row of data.rows ?? []) {
      const values = row.dimensionValues ?? []
      const name = values[0]?.value ?? ''
      const before =
        (periodAt >= 0 ? values[periodAt] : values.at(-1))?.value === 'before'
      const entry = rows.get(name) ?? { now: 0, before: 0, keyEvents: 0 }
      const sessions = Number(row.metricValues?.[0]?.value ?? 0)
      if (before) entry.before += sessions
      else {
        entry.now += sessions
        entry.keyEvents += Number(row.metricValues?.[1]?.value ?? 0)
      }
      rows.set(name, entry)
    }
    return [...rows]
      .map(([name, entry]) => ({
        [key]: name,
        sessions: entry.now,
        previousSessions: entry.before,
        keyEvents: entry.keyEvents,
      }))
      .sort(
        (a, b) =>
          b.sessions - a.sessions ||
          b.previousSessions - a.previousSessions ||
          String(a[key]).localeCompare(String(b[key])),
      )
  }
  const bySource = byName(aiSources, 'source')
  // Organic Search sessions by search engine, as Google Analytics names
  // each source, so a site that lives on Bing shows it here too.
  const byEngine = byName(engines, 'source')
  const aiNow = bySource.reduce((total, row) => total + row.sessions, 0)
  const aiBefore = bySource.reduce(
    (total, row) => total + row.previousSessions,
    0,
  )
  const data = {
    metadata: {
      timeZone: channels.metadata?.timeZone,
      subjectToThresholding: [
        channels,
        google,
        aiSources,
        aiPages,
        engines,
      ].some((data) => data.metadata?.subjectToThresholding),
      dataLossFromOtherRow: [
        channels,
        google,
        aiSources,
        aiPages,
        engines,
      ].some((data) => data.metadata?.dataLossFromOtherRow),
    },
  }
  const notes: string[] = []
  if (
    data.metadata?.timeZone &&
    data.metadata.timeZone !== 'America/Los_Angeles'
  ) {
    notes.push(
      `Google Analytics days use the property's time zone, ${data.metadata.timeZone}; Search Console days use Pacific time.`,
    )
  }
  if (data.metadata?.subjectToThresholding) {
    notes.push(
      'Google Analytics applied thresholding; small rows can be hidden.',
    )
  }
  if (data.metadata?.dataLossFromOtherRow) {
    notes.push('Google Analytics grouped some rows into (other).')
  }
  return {
    property: found.property,
    propertyName: found.name,
    webStream: found.stream,
    ...(pages ? { landingPageContains: pages } : {}),
    organicSearchFromGoogle: {
      sessions: periods.now.google.sessions,
      previousSessions: periods.before.google.sessions,
      sessionsChangePct: pct(
        periods.now.google.sessions,
        periods.before.google.sessions,
      ),
    },
    organicSearch: {
      sessions: periods.now.organic.sessions,
      previousSessions: periods.before.organic.sessions,
      sessionsChangePct: pct(
        periods.now.organic.sessions,
        periods.before.organic.sessions,
      ),
      keyEvents: periods.now.organic.keyEvents,
      previousKeyEvents: periods.before.organic.keyEvents,
    },
    allChannels: {
      sessions: periods.now.all.sessions,
      previousSessions: periods.before.all.sessions,
      sessionsChangePct: pct(
        periods.now.all.sessions,
        periods.before.all.sessions,
      ),
    },
    organicSearchByEngine: byEngine.slice(0, 10),
    aiAssistants: {
      sessions: aiNow,
      previousSessions: aiBefore,
      sessionsChangePct: pct(aiNow, aiBefore),
      bySource,
      topLandingPages: byName(aiPages, 'page').slice(0, 20),
      sources: AI_SOURCES,
    },
    notes,
  }
}

const change = (value: number | null) =>
  value === null ? 'n/a' : `${value > 0 ? '+' : ''}${value}%`

type AiRow = { sessions: number; previousSessions: number }

// Organic Search sessions by engine, when more than Google sends visits.
function engineText(rows: (AiRow & { source?: unknown })[]): string {
  const shown = rows.filter((row) => row.sessions || row.previousSessions)
  if (shown.length < 2) return ''
  return `Organic Search sessions by search engine: ${shown
    .slice(0, AI_ROWS)
    .map((row) => `${row.source} ${row.sessions} (was ${row.previousSessions})`)
    .join(', ')}.`
}

// Visits from AI assistants, by source and landing page.
function aiText(ai: {
  sessions: number
  previousSessions: number
  sessionsChangePct: number | null
  bySource: (AiRow & { source?: unknown })[]
  topLandingPages: (AiRow & { page?: unknown })[]
}): string {
  const list = (rows: (AiRow & Record<string, unknown>)[], key: string) =>
    rows
      .slice(0, AI_ROWS)
      .map((row) => `${row[key]} ${row.sessions} (was ${row.previousSessions})`)
      .join(', ')
  if (!ai.sessions && !ai.previousSessions) {
    return 'Visits from AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot and others): none in either period.'
  }
  return [
    `Visits from AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot and others): ${ai.sessions} sessions (was ${ai.previousSessions}, ${change(ai.sessionsChangePct)}). By source: ${list(ai.bySource, 'source')}.`,
    ai.topLandingPages.length
      ? `Top landing pages from AI assistants: ${list(ai.topLandingPages, 'page')}.`
      : '',
    'Only visits that pass a referrer or utm_source count; AI apps that send none show as Direct.',
  ]
    .filter(Boolean)
    .join(' ')
}

// Landing pages read for weighting page sections, most sessions first.
const LANDING_PAGES = 10_000

export type OrganicPages = {
  property: string
  propertyName: string
  // The web stream's host, without www: only URLs on it are matched.
  host: string
  // Organic Search sessions and key events by landing page path.
  pages: Map<string, { sessions: number; keyEvents: number }>
  // More landing pages exist than were read, or thresholding hid small
  // rows, so a page that is missing is unknown, not zero.
  capped: boolean
}

// Organic Search sessions and key events by landing page, for the same
// dates, from the property whose web stream matches the site (the one with
// the most sessions when several match). Null on a surface without Google
// Analytics; a sentence when it cannot be read.
export async function organicPages(
  access: AnalyticsAccess | undefined,
  site: string,
  range: DateRange,
): Promise<OrganicPages | string | null> {
  if (!access) return null
  try {
    const found = await findProperty(access, site)
    if (typeof found === 'string') return `Google Analytics: ${found}`
    const read = await Promise.all(
      found.map(async (item) => {
        const data = await runAnalyticsReport<
          ReportRows & { rowCount?: number }
        >(
          item.google,
          item.property,
          {
            dateRanges: [range],
            dimensions: [{ name: 'landingPage' }],
            metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
            dimensionFilter: filter(
              'sessionDefaultChannelGroup',
              'Organic Search',
            ),
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: LANDING_PAGES,
          },
          { signIn: access.signIn },
        )
        const pages = new Map<string, { sessions: number; keyEvents: number }>()
        let total = 0
        for (const row of data.rows ?? []) {
          const path = row.dimensionValues?.[0]?.value ?? ''
          const sessions = Number(row.metricValues?.[0]?.value ?? 0)
          const keyEvents = Number(row.metricValues?.[1]?.value ?? 0)
          total += sessions
          const entry = pages.get(path) ?? { sessions: 0, keyEvents: 0 }
          entry.sessions += sessions
          entry.keyEvents += keyEvents
          pages.set(path, entry)
        }
        return {
          item,
          pages,
          total,
          // Thresholding can hide small rows too.
          capped:
            (data.rowCount ?? 0) > (data.rows?.length ?? 0) ||
            Boolean(data.metadata?.subjectToThresholding),
        }
      }),
    )
    const best = [...read].sort((a, b) => b.total - a.total)[0]
    if (!best) return 'Google Analytics: no matching property.'
    return {
      property: best.item.property,
      propertyName: best.item.name,
      host: hostOf(best.item.stream).replace(/^www\./, ''),
      pages: best.pages,
      capped: best.capped,
    }
  } catch (error) {
    return `Google Analytics: could not be read. ${error instanceof Error ? error.message : String(error)}`
  }
}

// Adds each row's landing page keyEvents and organicSessions (Google
// Analytics, Organic Search, same dates) to a page section's items, then
// puts the pages that converted first, most key events first, keeping the
// section's own order otherwise. A page Google Analytics did not list is 0
// when every landing page was read, else null (unknown). Returns the note
// that says so.
export function weighByKeyEvents(
  report: Record<string, unknown>,
  ga: OrganicPages | string,
): string {
  if (typeof ga === 'string') return `Not ranked by key events. ${ga}`
  const items = report.items
  if (!Array.isArray(items) || !items.length) return ''
  const lookup = (url: unknown) => {
    if (typeof url !== 'string') return undefined
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return undefined
    }
    if (parsed.hostname.replace(/^www\./, '') !== ga.host) return undefined
    const path = parsed.pathname
    const other = path.endsWith('/') ? path.slice(0, -1) || '/' : `${path}/`
    return ga.pages.get(path) ?? ga.pages.get(other) ?? null
  }
  const weighed = (items as Record<string, unknown>[]).map((item, index) => {
    const found = lookup(item.url ?? item.page)
    // undefined: another host, so Google Analytics cannot say.
    const known =
      found === undefined || (found === null && ga.capped)
        ? undefined
        : (found ?? { sessions: 0, keyEvents: 0 })
    const keyEvents = known?.keyEvents ?? null
    return {
      index,
      item: {
        ...item,
        keyEvents,
        organicSessions: known?.sessions ?? null,
      } as Record<string, unknown> & { keyEvents: number | null },
    }
  })
  weighed.sort(
    (a, b) =>
      (b.item.keyEvents ?? 0) - (a.item.keyEvents ?? 0) || a.index - b.index,
  )
  report.items = weighed.map((entry) => entry.item)
  const pages = new Set(
    weighed
      .filter((entry) => entry.item.keyEvents)
      .map((entry) => entry.item.url ?? entry.item.page),
  ).size
  return [
    pages
      ? `Pages that converted come first: ${pages} ${pages === 1 ? 'page' : 'pages'} here had Google Analytics key events from Organic Search in the same dates (property ${ga.propertyName}, ${ga.property}); the rest keep this section's order.`
      : `${ga.capped ? 'None of these pages that Google Analytics listed' : 'None of these pages'} had Google Analytics key events from Organic Search in the same dates (property ${ga.propertyName}, ${ga.property}), so the section keeps its own order.`,
    'keyEvents and organicSessions are Google Analytics counts for the whole landing page, not for one query, and sessions are not Search Console clicks.',
    ga.capped
      ? 'Google Analytics did not list every landing page (row limit or thresholding), so a blank keyEvents is unknown, not zero.'
      : '',
  ]
    .filter(Boolean)
    .join(' ')
}

// The Google Analytics line for a report on a Search Console site, for the
// same dates. It never stops the report: a missing match or a failure is
// named instead.
export async function analyticsBeside(
  access: AnalyticsAccess | undefined,
  site: string,
  range: DateRange,
  before: DateRange,
  pages?: string,
): Promise<{ text: string; data: unknown } | null> {
  if (!access) return null
  try {
    const found = await findProperty(access, site)
    if (typeof found === 'string') {
      return {
        text: `Google Analytics: ${found}`,
        data: { error: found },
      }
    }
    const read = await Promise.all(
      found.map((item) =>
        totals(item, access, range, before, pages).catch((error: unknown) =>
          error instanceof Error ? error : new Error(String(error)),
        ),
      ),
    )
    const readable = read.filter(
      (item): item is Awaited<ReturnType<typeof totals>> =>
        !(item instanceof Error),
    )
    const data = [...readable].sort(
      (a, b) => b.allChannels.sessions - a.allChannels.sessions,
    )[0]
    if (!data) throw read[0]
    const others = found
      .filter((item) => item.property !== data.property)
      .map((item) => `${item.name} (${item.property})`)
    const google = data.organicSearchFromGoogle
    const organic = data.organicSearch
    const all = data.allChannels
    const keyEvents =
      organic.keyEvents || organic.previousKeyEvents
        ? `, Organic Search key events ${organic.keyEvents} (was ${organic.previousKeyEvents})`
        : ''
    return {
      text: [
        `Google Analytics, property ${data.propertyName} (${data.property}), matched by its web stream ${data.webStream}${pages ? `, landing pages whose path contains "${pages}"` : ''}: Organic Search sessions from Google ${google.sessions} (was ${google.previousSessions}, ${change(google.sessionsChangePct)}), from every search engine ${organic.sessions} (was ${organic.previousSessions}, ${change(organic.sessionsChangePct)})${keyEvents}, sessions from all channels ${all.sessions} (was ${all.previousSessions}, ${change(all.sessionsChangePct)}).`,
        engineText(data.organicSearchByEngine),
        'Sessions are Google Analytics’ own count, not Search Console clicks.',
        ...data.notes,
        ...(others.length
          ? [
              `Other properties with a matching web stream, with fewer sessions: ${others.join(', ')}.`,
            ]
          : []),
      ]
        .filter(Boolean)
        .join(' ')
        .concat('\n\n', aiText(data.aiAssistants)),
      data: { ...data, ...(others.length ? { otherMatches: others } : {}) },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      text: `Google Analytics: could not be read. ${message}`,
      data: { error: message },
    }
  }
}
