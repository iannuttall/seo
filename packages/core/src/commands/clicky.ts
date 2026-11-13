import { aiReferralSourceForValue } from '../analyze/ai-referrals-sources.js'
import {
  ClickyError,
  type ClickyItem,
  type ClickyLogin,
  type ClickySite,
  clickyDomain,
  clickyStats,
  isClickySiteId,
  isClickySitekey,
} from '../clicky/api.js'
import { change } from './analytics-site.js'
import type { Detail } from './present.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { pct } from './shared.js'
import { CommandError, type CommandResult, type DateRange } from './types.js'

// Clicky landing pages, traffic sources and search engines for one saved
// Clicky site. Numbers stay Clicky's own: visits, as Clicky counts them.
// Nothing here turns them into Google Analytics sessions, users or events.

// Each saved Clicky site is one key, x-clicky-<site id>. Its value is the
// sitekey, or JSON with the sitekey, the site's domain when it is known and
// whether it came from the saved Clicky account.
export const CLICKY_KEY_PREFIX = 'x-clicky-'

// A saved Clicky account login, as JSON. Its sites are saved as site keys,
// and read again when a site is not found, so new Clicky sites appear.
export const CLICKY_ACCOUNT_KEY = 'x-clicky-account'

export type SavedClickySite = ClickySite & {
  domain: string | null
  account: boolean
}

export function clickyKeyValue(
  sitekey: string,
  domain: string | null,
  account = false,
) {
  return JSON.stringify(
    account ? { sitekey, domain, account } : { sitekey, domain },
  )
}

export function clickyLoginValue(login: ClickyLogin) {
  return JSON.stringify(login)
}

export function clickyLogin(keys: Headers): ClickyLogin | null {
  try {
    const parsed = JSON.parse(keys.get(CLICKY_ACCOUNT_KEY) ?? '') as {
      username?: unknown
      password?: unknown
    }
    return typeof parsed.username === 'string' &&
      typeof parsed.password === 'string'
      ? { username: parsed.username, password: parsed.password }
      : null
  } catch {
    return null
  }
}

export function clickySites(keys: Headers): SavedClickySite[] {
  const sites: SavedClickySite[] = []
  for (const [name, value] of keys) {
    if (!name.startsWith(CLICKY_KEY_PREFIX)) continue
    const siteId = name.slice(CLICKY_KEY_PREFIX.length)
    if (!isClickySiteId(siteId)) continue
    let sitekey = value.trim()
    let domain: string | null = null
    let account = false
    if (sitekey.startsWith('{')) {
      try {
        const parsed = JSON.parse(sitekey) as {
          sitekey?: unknown
          domain?: unknown
          account?: unknown
        }
        sitekey = typeof parsed.sitekey === 'string' ? parsed.sitekey : ''
        domain = typeof parsed.domain === 'string' ? parsed.domain : null
        account = parsed.account === true
      } catch {
        continue
      }
    }
    if (isClickySitekey(sitekey)) {
      sites.push({ siteId, sitekey, domain, account })
    }
  }
  return sites.sort((left, right) =>
    left.siteId < right.siteId ? -1 : left.siteId > right.siteId ? 1 : 0,
  )
}

export const clickyLabel = (site: { siteId: string; domain: string | null }) =>
  site.domain ? `${site.siteId} (${site.domain})` : site.siteId

function hostOf(value: string): string {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/u, '')
  try {
    return new URL(
      text.includes('://') ? text : `https://${text}`,
    ).hostname.replace(/^www\./u, '')
  } catch {
    return text
  }
}

// The saved Clicky site with this site ID, or whose domain is the site's.
// When none matches and a Clicky account is saved, its site list is read
// again once. A site saved without its domain (on this machine) is looked
// up once.
export async function pickClickySite(
  saved: SavedClickySite[],
  target: string,
  connect: string,
  refresh?: () => Promise<SavedClickySite[] | null>,
): Promise<SavedClickySite> {
  const host = hostOf(target)
  const match = (site: SavedClickySite) =>
    site.siteId === target.trim() || site.domain === host
  let sites = saved
  if (!sites.some(match) && refresh) sites = (await refresh()) ?? sites
  if (!sites.length) {
    throw new CommandError(
      'NO_KEY',
      `No Clicky site is saved. Add your Clicky account, or one site's ID and sitekey (Clicky, Preferences, Info): ${connect}`,
    )
  }
  const found = sites.find(match)
  if (found) return found
  if (!isClickySiteId(target)) {
    for (const site of sites.filter((item) => !item.domain).slice(0, 10)) {
      site.domain = await clickyDomain(site).catch(() => null)
    }
    const named = sites.find(match)
    if (named) return named
  }
  throw new CommandError(
    'NO_ACCESS',
    `No saved Clicky site matches ${target}. Saved Clicky sites: ${sites.map(clickyLabel).join(', ')}. Pass one of these site IDs, or add the site: ${connect}`,
  )
}

const DAY = 86_400_000
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)

// Clicky reads at most 31 days at a time. The default is the last 28 full
// days.
function clickyRange(input: { startDate?: string; endDate?: string }) {
  if (!input.startDate && !input.endDate) {
    const end = Date.now() - DAY
    return { startDate: isoDay(end - 27 * DAY), endDate: isoDay(end) }
  }
  const start = Date.parse(`${input.startDate}T00:00:00Z`)
  const end = Date.parse(`${input.endDate}T00:00:00Z`)
  if (!input.startDate || !input.endDate || !(start <= end)) {
    throw new CommandError(
      'INVALID_INPUT',
      'Send a start date and an end date together, in order.',
    )
  }
  if ((end - start) / DAY + 1 > 31) {
    throw new CommandError(
      'INVALID_INPUT',
      'Clicky reads at most 31 days at a time. Send a shorter range.',
    )
  }
  return { startDate: input.startDate, endDate: input.endDate }
}

const count = (item: ClickyItem) => {
  const value = Number(item.value)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

const totals = (items: ClickyItem[]) =>
  items
    .map((item) => ({ name: item.title ?? '', visits: count(item) }))
    .filter(
      (item): item is { name: string; visits: number } =>
        Boolean(item.name) && item.visits !== null,
    )

// The top ten, then the rest as one count.
const line = (items: { name: string; visits: number }[]) => {
  const top = items.slice(0, 10).map((item) => `${item.name} ${item.visits}`)
  const rest = items.slice(10)
  if (rest.length) {
    top.push(
      `${rest.length} others ${rest.reduce((sum, item) => sum + item.visits, 0)}`,
    )
  }
  return top.join('; ')
}

export type ClickyRowsInput = {
  // A saved Clicky site ID, or a domain that matches a saved site.
  site: string
  startDate?: string
  endDate?: string
  detail?: Detail
  offset?: number
}

const LIMIT = 1000

export async function runClickyRows(
  input: ClickyRowsInput,
  keys: Headers,
  options: {
    connect: string
    call: (offset: number) => string
    // Reads the saved Clicky account's sites again; null without one.
    refresh?: () => Promise<Headers | null>
  },
): Promise<CommandResult> {
  const refresh = options.refresh
  const site = await pickClickySite(
    clickySites(keys),
    input.site,
    options.connect,
    refresh &&
      (async () => {
        const fresh = await refresh().catch(() => null)
        return fresh && clickySites(fresh)
      }),
  )
  const range = clickyRange(input)
  const offset = input.offset ?? 0
  const types = ['pages-entrance', 'traffic-sources', 'searches-engines']
  const stats = await clickyStats(site, types, {
    date: `${range.startDate},${range.endDate}`,
    limit: LIMIT,
  }).catch((error: unknown) => {
    if (error instanceof ClickyError) {
      throw new CommandError(
        error.code === 'auth' ? 'NO_ACCESS' : 'PROVIDER_ERROR',
        error.code === 'auth'
          ? `${error.message} Save it again: ${options.connect}`
          : error.message,
      )
    }
    throw error
  })
  const entrances = stats['pages-entrance'] ?? []
  const visitsByPage = new Map<string, number>()
  for (const item of entrances) {
    const visits = count(item)
    if (visits === null || !item.url) continue
    let page: string
    try {
      page = new URL(item.url).pathname
    } catch {
      continue
    }
    visitsByPage.set(page, (visitsByPage.get(page) ?? 0) + visits)
  }
  const rows = [...visitsByPage]
    .map(([page, visits]) => ({ page, visits }))
    .sort(
      (left, right) =>
        right.visits - left.visits ||
        (left.page < right.page ? -1 : left.page > right.page ? 1 : 0),
    )
  const sources = totals(stats['traffic-sources'] ?? [])
  const engines = totals(stats['searches-engines'] ?? [])
  const notes = [
    'Visits by landing page from every source, as Clicky counts them, in the Clicky site’s time zone. Clicky does not split landing pages by source.',
    sources.length
      ? `Traffic sources (visits): ${line(sources)}.`
      : 'Traffic sources: none in this range.',
    engines.length
      ? `Search engines (visits): ${line(engines)}.`
      : 'Search engines: none in this range.',
  ]
  if (entrances.length >= LIMIT) {
    notes.push(
      `Clicky returned its ${LIMIT}-row limit; pages past it are missing, not zero.`,
    )
  }
  return {
    text: rowsText({
      title: `Clicky site ${clickyLabel(site)}: landing pages, ${range.startDate} to ${range.endDate}.`,
      rows,
      offset,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes,
      more: options.call,
    }),
    data: {
      siteId: site.siteId,
      domain: site.domain,
      range,
      metric: 'visits',
      sources,
      searchEngines: engines,
      capped: entrances.length >= LIMIT,
      total: rows.length,
      offset,
      rows: rows.slice(offset, offset + PAGE_SIZE),
    },
  }
}

// Clicky beside Search Console in seo compare: the saved Clicky site whose
// domain is the site's, with its visits for both periods. Null when no saved
// Clicky site matches, so a person with Clicky on other sites sees nothing.
// A failure is named instead of stopping the comparison.

// Clicky returns at most 100 rows a request on a free account.
const FREE_LIMIT = 100
// How far back a free Clicky account keeps data.
const FREE_HISTORY_DAYS = 30

type Compared = { visits: number; previousVisits: number }

// Visits now and before for each name, most visits first.
function compared(
  now: { name: string; visits: number }[],
  before: { name: string; visits: number }[],
) {
  const rows = new Map<string, Compared>()
  const add = (name: string, visits: number, key: keyof Compared) => {
    const row = rows.get(name) ?? { visits: 0, previousVisits: 0 }
    row[key] += visits
    rows.set(name, row)
  }
  for (const item of now) add(item.name, item.visits, 'visits')
  for (const item of before) add(item.name, item.visits, 'previousVisits')
  return [...rows]
    .map(([name, row]) => ({ name, ...row }))
    .sort(
      (left, right) =>
        right.visits - left.visits ||
        right.previousVisits - left.previousVisits ||
        (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
    )
}

const sum = (rows: Compared[]) => ({
  visits: rows.reduce((total, row) => total + row.visits, 0),
  previousVisits: rows.reduce((total, row) => total + row.previousVisits, 0),
})

const was = (rows: (Compared & { name: string })[]) =>
  rows
    .slice(0, 10)
    .map((row) => `${row.name} ${row.visits} (was ${row.previousVisits})`)
    .join(', ')

export async function clickyBeside(
  keys: Headers | undefined,
  site: string,
  range: DateRange,
  before: DateRange,
  pages?: string,
): Promise<{ text: string; data: unknown } | null> {
  const saved = keys ? clickySites(keys) : []
  if (!saved.length) return null
  let found: SavedClickySite
  try {
    found = await pickClickySite(saved, site, '')
  } catch {
    return null
  }
  const types = [
    'visitors',
    'traffic-sources',
    'links-domains',
    ...(pages ? ['pages-entrance'] : []),
  ]
  try {
    // One period after the other: Clicky takes one request at a time for a
    // site.
    const read = (dates: DateRange) =>
      clickyStats(found, types, {
        date: `${dates.startDate},${dates.endDate}`,
        limit: LIMIT,
      })
    const now = await read(range)
    const then = await read(before)
    // The visitors tally is one untitled item for the whole range.
    const tally = (items: ClickyItem[]) =>
      items.reduce((total, item) => total + (count(item) ?? 0), 0)
    const visits = {
      visits: tally(now.visitors ?? []),
      previousVisits: tally(then.visitors ?? []),
    }
    const sources = compared(
      totals(now['traffic-sources'] ?? []),
      totals(then['traffic-sources'] ?? []),
    )
    // Incoming links from AI assistants, by assistant.
    const fromAi = (items: ClickyItem[]) =>
      totals(items).flatMap((item) => {
        const source = aiReferralSourceForValue(item.name)
        return source ? [{ name: source.label, visits: item.visits }] : []
      })
    const ai = compared(
      fromAi(now['links-domains'] ?? []),
      fromAi(then['links-domains'] ?? []),
    )
    const aiTotal = sum(ai)
    // Landing-page visits from every source on pages whose path contains
    // the text.
    const landed = (items: ClickyItem[]) => {
      let total = 0
      for (const item of items) {
        const value = count(item)
        if (value === null || !item.url) continue
        try {
          if (new URL(item.url).pathname.includes(pages ?? '')) total += value
        } catch {}
      }
      return total
    }
    const onPages = pages
      ? {
          contains: pages,
          visits: landed(now['pages-entrance'] ?? []),
          previousVisits: landed(then['pages-entrance'] ?? []),
        }
      : null
    // A list as long as a row limit may be cut there.
    const cut = (type: string) =>
      [now, then].some((stats) => {
        const length = stats[type]?.length ?? 0
        return length >= LIMIT || length === FREE_LIMIT
      })
    const linksCut = cut('links-domains')
    const pagesCut = Boolean(pages) && cut('pages-entrance')
    const daysBack = Math.round(
      (Date.now() - Date.parse(`${before.startDate}T00:00:00Z`)) / DAY,
    )
    const notes = [
      'Visits are Clicky’s own count, in the Clicky site’s time zone; they are not Google Analytics sessions or Search Console clicks.',
      pagesCut
        ? 'Clicky’s list of landing pages reached its row limit (100 on a free account, 1,000 otherwise), so the landing-page total can be higher than shown.'
        : '',
      daysBack > FREE_HISTORY_DAYS
        ? `The earlier period starts ${daysBack} days ago; a free Clicky account keeps 30 days, so on one it can read as zero.`
        : '',
    ].filter(Boolean)
    const total = `${visits.visits} (was ${visits.previousVisits}, ${change(pct(visits.visits, visits.previousVisits))})`
    const text = [
      `Clicky site ${clickyLabel(found)}: visits ${total}${pages ? ' on the whole site' : ''}.`,
      sources.length ? `Traffic sources (visits): ${was(sources)}.` : '',
      onPages
        ? `Visits that landed on pages whose path contains "${pages}", from every source: ${onPages.visits} (was ${onPages.previousVisits}, ${change(pct(onPages.visits, onPages.previousVisits))}). Clicky does not split landing pages by source.`
        : '',
      ...notes,
    ]
      .filter(Boolean)
      .join(' ')
    const limit =
      'Clicky’s list of incoming link domains reached its row limit (100 on a free account, 1,000 otherwise)'
    const aiLine = [
      aiTotal.visits || aiTotal.previousVisits
        ? `Visits from AI assistants in Clicky’s incoming links (whole site): ${aiTotal.visits} (was ${aiTotal.previousVisits}, ${change(pct(aiTotal.visits, aiTotal.previousVisits))}). By source: ${was(ai)}.`
        : linksCut
          ? `Visits from AI assistants in Clicky’s incoming links (whole site): none among the domains Clicky listed. ${limit}, so this is unknown, not zero.`
          : 'Visits from AI assistants in Clicky’s incoming links (whole site): none in either period.',
      linksCut && (aiTotal.visits || aiTotal.previousVisits)
        ? `${limit}, so these can be higher.`
        : '',
      'Only visits that pass a referrer count; AI apps that send none show as direct.',
    ]
      .filter(Boolean)
      .join(' ')
    return {
      text: `${text}\n\n${aiLine}`,
      data: {
        siteId: found.siteId,
        domain: found.domain,
        metric: 'visits',
        ...visits,
        visitsChangePct: pct(visits.visits, visits.previousVisits),
        trafficSources: sources.map(({ name, ...row }) => ({
          source: name,
          ...row,
        })),
        ...(onPages ? { landingPages: { ...onPages, capped: pagesCut } } : {}),
        aiAssistants: {
          ...aiTotal,
          visitsChangePct: pct(aiTotal.visits, aiTotal.previousVisits),
          bySource: ai.map(({ name, ...row }) => ({ source: name, ...row })),
          capped: linksCut,
        },
        notes,
      },
    }
  } catch (error) {
    const message =
      error instanceof ClickyError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error)
    return {
      text: `Clicky: could not be read. ${message}`,
      data: { error: message },
    }
  }
}
