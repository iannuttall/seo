import {
  ClickyError,
  type ClickyItem,
  type ClickySite,
  clickyDomain,
  clickyStats,
  isClickySiteId,
  isClickySitekey,
} from '../clicky/api.js'
import type { Detail } from './present.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { CommandError, type CommandResult } from './types.js'

// Clicky landing pages, traffic sources and search engines for one saved
// Clicky site. Numbers stay Clicky's own: visits, as Clicky counts them.
// Nothing here turns them into Google Analytics sessions, users or events.

// Each saved Clicky site is one key, x-clicky-<site id>. Its value is the
// sitekey, or JSON with the sitekey and the site's domain when it is known.
export const CLICKY_KEY_PREFIX = 'x-clicky-'

export type SavedClickySite = ClickySite & { domain: string | null }

export function clickyKeyValue(sitekey: string, domain: string | null) {
  return JSON.stringify({ sitekey, domain })
}

export function clickySites(keys: Headers): SavedClickySite[] {
  const sites: SavedClickySite[] = []
  for (const [name, value] of keys) {
    if (!name.startsWith(CLICKY_KEY_PREFIX)) continue
    const siteId = name.slice(CLICKY_KEY_PREFIX.length)
    if (!isClickySiteId(siteId)) continue
    let sitekey = value.trim()
    let domain: string | null = null
    if (sitekey.startsWith('{')) {
      try {
        const parsed = JSON.parse(sitekey) as {
          sitekey?: unknown
          domain?: unknown
        }
        sitekey = typeof parsed.sitekey === 'string' ? parsed.sitekey : ''
        domain = typeof parsed.domain === 'string' ? parsed.domain : null
      } catch {
        continue
      }
    }
    if (isClickySitekey(sitekey)) sites.push({ siteId, sitekey, domain })
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
// A site saved without its domain (on this machine) is looked up once.
export async function pickClickySite(
  sites: SavedClickySite[],
  target: string,
  connect: string,
): Promise<SavedClickySite> {
  if (!sites.length) {
    throw new CommandError(
      'NO_KEY',
      `No Clicky site is saved. Add its site ID and sitekey (Clicky, Preferences, Info): ${connect}`,
    )
  }
  const host = hostOf(target)
  const match = (site: SavedClickySite) =>
    site.siteId === target.trim() || site.domain === host
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
  options: { connect: string; call: (offset: number) => string },
): Promise<CommandResult> {
  const site = await pickClickySite(
    clickySites(keys),
    input.site,
    options.connect,
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
