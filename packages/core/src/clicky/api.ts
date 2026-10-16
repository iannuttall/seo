import { readJson } from '../http/read-json.js'

// Every Clicky stats API call, shared by the CLI, both MCP servers and any
// other host. Worker-safe: fetch only. A Clicky key is one site: its numeric
// site ID and its sitekey.

const ENDPOINT = 'https://api.clicky.com/api/stats/4'
const MAX_BYTES = 5_000_000

export type ClickySite = { siteId: string; sitekey: string }

export type ClickyItem = {
  value?: string | number
  value_percent?: string | number
  title?: string
  url?: string
}

export class ClickyError extends Error {
  constructor(
    readonly code: 'auth' | 'remote',
    message: string,
  ) {
    super(message)
  }
}

export function isClickySiteId(value: string): boolean {
  return /^\d{1,30}$/u.test(value.trim())
}

export function isClickySitekey(value: string): boolean {
  return /^[A-Za-z0-9]{12,64}$/u.test(value.trim())
}

type Group = {
  type?: string
  error?: string
  dates?: { date?: string; items?: ClickyItem[] }[]
}

// One or more report types for one date or range, such as
// "2026-01-01,2026-01-28" or "last-30-days". Returns the items per type.
export async function clickyStats(
  site: ClickySite,
  types: string[],
  options: { date?: string; limit?: number } = {},
): Promise<Record<string, ClickyItem[]>> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('site_id', site.siteId)
  url.searchParams.set('sitekey', site.sitekey)
  url.searchParams.set('type', types.join(','))
  url.searchParams.set('output', 'json')
  url.searchParams.set('limit', String(options.limit ?? 1000))
  url.searchParams.set('app', 'seo')
  if (options.date) url.searchParams.set('date', options.date)
  const response = await fetch(url).catch(() => {
    throw new ClickyError('remote', 'Could not reach Clicky. Try again.')
  })
  if (!response.ok) {
    throw new ClickyError('remote', `Clicky returned ${response.status}.`)
  }
  const groups = await readJson<Group[]>(response, 'Clicky', {
    maxBytes: MAX_BYTES,
  })
  if (!Array.isArray(groups)) {
    throw new ClickyError('remote', 'Clicky returned invalid data.')
  }
  const failed = groups.find((group) => typeof group?.error === 'string')
  if (failed?.error) {
    throw /sitekey|site id|authenticat|permission/iu.test(failed.error)
      ? new ClickyError(
          'auth',
          `Clicky rejected site ID ${site.siteId} or its sitekey.`,
        )
      : new ClickyError('remote', `Clicky: ${failed.error.slice(0, 200)}`)
  }
  const out: Record<string, ClickyItem[]> = {}
  for (const type of types) out[type] = []
  for (const group of groups) {
    if (!group?.type || !(group.type in out)) continue
    for (const date of group.dates ?? []) {
      for (const item of date.items ?? []) {
        if (item && typeof item === 'object') out[group.type]?.push(item)
      }
    }
  }
  return out
}

// The site's host from one recent page URL, so a saved site can be matched
// to a domain. Null when the site has no recent pages. Also checks the key.
export async function clickyDomain(site: ClickySite): Promise<string | null> {
  const { pages } = await clickyStats(site, ['pages'], {
    date: 'last-30-days',
    limit: 1,
  })
  const url = pages?.find((item) => item.url)?.url
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./u, '')
  } catch {
    return null
  }
}

// A Clicky account login: the username or email and the account password.
// Clicky has no token for the account API, and an account that signs in to
// Clicky with Google has no password, so this does not work for it.
export type ClickyLogin = { username: string; password: string }

export type ClickyAccountSite = ClickySite & { domain: string | null }

// The password goes in the POST body, not in the web address.
const ACCOUNT_ENDPOINT =
  'https://api.clicky.com/api/account/sites?output=json&app=seo'

// Every site in a Clicky account, with its site ID, sitekey and domain.
// The admin sitekeys Clicky also returns are dropped here.
export async function clickyAccountSites(
  login: ClickyLogin,
): Promise<ClickyAccountSite[]> {
  const response = await fetch(ACCOUNT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: login.username,
      password: login.password,
    }),
  }).catch(() => {
    throw new ClickyError('remote', 'Could not reach Clicky. Try again.')
  })
  if (!response.ok) {
    throw new ClickyError('remote', `Clicky returned ${response.status}.`)
  }
  const body = await readJson<unknown>(response, 'Clicky', {
    maxBytes: MAX_BYTES,
  })
  const items: Record<string, unknown>[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      if ('error' in record || 'site_id' in record || 'sitekey' in record) {
        items.push(record)
      }
      for (const nested of ['items', 'dates', 'sites']) walk(record[nested])
    }
  }
  walk(body)
  const failed = items.find((item) => typeof item.error === 'string')
  if (failed) {
    throw /password|username|match|login|google/iu.test(String(failed.error))
      ? new ClickyError(
          'auth',
          'Clicky did not accept that username and password.',
        )
      : new ClickyError(
          'remote',
          `Clicky: ${String(failed.error).slice(0, 200)}`,
        )
  }
  const sites: ClickyAccountSite[] = []
  for (const item of items) {
    const siteId = String(item.site_id ?? item.id ?? '').trim()
    const sitekey = String(item.sitekey ?? '').trim()
    if (!isClickySiteId(siteId) || !isClickySitekey(sitekey)) continue
    sites.push({ siteId, sitekey, domain: hostOf(item.hostname ?? item.url) })
  }
  return sites
}

function hostOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value.trim().toLowerCase()
  try {
    return new URL(
      text.includes('://') ? text : `https://${text}`,
    ).hostname.replace(/^www\./u, '')
  } catch {
    return null
  }
}
