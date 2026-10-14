// Free Ahrefs Domain Rating for the domains in research rows. It uses the
// caller's Ahrefs key when they gave one, otherwise the server's key. The
// free endpoint costs no units. The Domain Rating License requires the
// attribution next to the data and does not allow a raw DR feed, so DR only
// appears as a column beside other research data.

export const DR_ATTRIBUTION =
  'domain_rating: Domain Rating by Ahrefs (https://ahrefs.com/).'

const ENDPOINT = 'https://api.ahrefs.com/v3/public/domain-rating-free'
const MAX_DOMAINS = 25
const TTL_SECONDS = 24 * 60 * 60
const DOMAIN_FIELDS = ['domain', 'competitor_domain', 'Dn'] as const

type Row = Record<string, string | number | boolean | null>

type SharedCache = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

export function bareDomain(value: string): string {
  return value
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .toLowerCase()
}

async function lookup(domain: string, key: string): Promise<number | null> {
  const url = `${ENDPOINT}?target=${encodeURIComponent(domain)}`
  // DR of a public domain is the same for everyone, so one cached copy per
  // domain for a day keeps calls to Ahrefs low.
  // The Workers cache; the CLI has none and asks each time.
  const cache = (globalThis as { caches?: { default?: SharedCache } }).caches
    ?.default
  const cacheKey = new Request(url)
  const cached = await cache?.match(cacheKey)
  const response =
    cached ??
    (await fetch(url, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    }))
  if (!response.ok) return null
  const body = (await response.clone().json()) as {
    domain_rating?: { domain_rating?: number | null }
  }
  if (cache && !cached) {
    const copy = new Response(response.body, response)
    copy.headers.set('cache-control', `max-age=${TTL_SECONDS}`)
    await cache.put(cacheKey, copy)
  }
  return body.domain_rating?.domain_rating ?? null
}

export async function domainRatings(
  domains: string[],
  key: string | null | undefined,
): Promise<Map<string, number | null>> {
  const found = new Map<string, number | null>()
  if (!key) return found
  const unique = [...new Set(domains.map(bareDomain).filter(Boolean))].slice(
    0,
    MAX_DOMAINS,
  )
  const values = await Promise.all(
    unique.map((domain) => lookup(domain, key).catch(() => null)),
  )
  unique.forEach((domain, index) => {
    found.set(domain, values[index] ?? null)
  })
  return found
}

// Adds a domain_rating column after the domain column of each row that has a
// domain and no DR yet. Rows past the first MAX_DOMAINS domains get null.
export async function withDomainRating(
  rows: Row[],
  key: string | null | undefined,
): Promise<{ rows: Row[]; added: boolean }> {
  const field = DOMAIN_FIELDS.find((name) =>
    rows.some((row) => typeof row[name] === 'string'),
  )
  if (!key || !field || rows.some((row) => 'domain_rating' in row)) {
    return { rows, added: false }
  }
  const ratings = await domainRatings(
    rows.map((row) => String(row[field] ?? '')),
    key,
  )
  const out = rows.map((row) => {
    const next: Row = {}
    for (const [name, value] of Object.entries(row)) {
      next[name] = value
      if (name === field) {
        next.domain_rating =
          ratings.get(bareDomain(String(value ?? ''))) ?? null
      }
    }
    return next
  })
  return { rows: out, added: true }
}
