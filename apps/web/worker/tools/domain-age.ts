// Looks up when a domain was registered, from the registry's own RDAP
// server. IANA's bootstrap file names the server for each top-level domain,
// so no third-party lookup service sits in between.
import { readJson } from '@seo/core/hosted'
import { isBrowserRequestFromSameSite, type SitemapFetcher } from './sitemap.ts'

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json'

export const DOMAIN_AGE_LIMITS = Object.freeze({
  requestBytes: 1_024,
  bootstrapBytes: 524_288,
  rdapBytes: 262_144,
  lookups: 4,
  timeoutMilliseconds: 8_000,
})

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

export type DomainAgeResult = {
  schema: 1
  input: string
  domain: string
  // found: the registry returned the domain. not-found: no candidate name
  // was in the registry. no-rdap: the top-level domain has no RDAP server.
  state: 'found' | 'not-found' | 'no-rdap'
  registeredAt: string | null
  expiresAt: string | null
  updatedAt: string | null
  transferredAt: string | null
  registrar: string | null
  status: string[]
  nameservers: string[]
  source: { server: string | null; url: string | null; checkedAt: string }
}

class DomainAgeInputError extends Error {}
class DomainAgeFetchError extends Error {}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

type RdapRecord = Record<string, unknown>

const isRecord = (value: unknown): value is RdapRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function parseDomain(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DomainAgeInputError('Enter a domain such as example.com.')
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2_048) {
    throw new DomainAgeInputError('Enter a domain such as example.com.')
  }
  let hostname: string
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    )
    hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    throw new DomainAgeInputError('Enter a domain such as example.com.')
  }
  const labels = hostname.split('.')
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some(
      (label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label),
    ) ||
    /^\d+$/.test(labels.at(-1) ?? '') ||
    ['localhost', 'local', 'internal', 'arpa', 'test', 'invalid'].includes(
      labels.at(-1) ?? '',
    )
  ) {
    throw new DomainAgeInputError('Enter a public domain such as example.com.')
  }
  return labels[0] === 'www' && labels.length > 2
    ? labels.slice(1).join('.')
    : hostname
}

async function fetchJson(
  fetcher: SitemapFetcher,
  url: string,
  maxBytes: number,
  cacheSeconds: number,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    DOMAIN_AGE_LIMITS.timeoutMilliseconds,
  )
  try {
    const response = await fetcher(url, {
      headers: {
        accept: 'application/rdap+json, application/json;q=0.9',
        'user-agent': 'SEO-Domain-Age-Tool/1.0 (+https://seoskill.dev/tools)',
      },
      signal: controller.signal,
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { '200-299': cacheSeconds, '404': 300, '500-599': 0 },
      },
    } as RequestInit)
    if (response.status === 404) {
      await response.body?.cancel()
      return { status: 404, body: null }
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new DomainAgeFetchError(
        `The registry answered with HTTP ${response.status}.`,
      )
    }
    return {
      status: response.status,
      body: await readJson(response, 'The registry', { maxBytes }),
    }
  } catch (error) {
    if (error instanceof DomainAgeFetchError) throw error
    throw new DomainAgeFetchError(
      controller.signal.aborted
        ? 'The registry did not answer in time.'
        : 'The registry could not be reached.',
    )
  } finally {
    clearTimeout(timer)
  }
}

// The RDAP server for the longest top-level domain the bootstrap lists.
function rdapServer(
  bootstrap: unknown,
  domain: string,
): { server: string; suffixLabels: number } | null {
  const services =
    isRecord(bootstrap) && Array.isArray(bootstrap.services)
      ? bootstrap.services
      : []
  const servers = new Map<string, string>()
  for (const service of services) {
    if (!Array.isArray(service) || !Array.isArray(service[0])) continue
    const url = Array.isArray(service[1])
      ? service[1].find(
          (entry): entry is string =>
            typeof entry === 'string' && entry.startsWith('https://'),
        )
      : undefined
    if (!url) continue
    for (const tld of service[0]) {
      if (typeof tld === 'string') servers.set(tld.toLowerCase(), url)
    }
  }
  const labels = domain.split('.')
  for (let start = 1; start < labels.length; start++) {
    const suffix = labels.slice(start).join('.')
    const server = servers.get(suffix)
    if (server) {
      return {
        server: server.endsWith('/') ? server : `${server}/`,
        suffixLabels: labels.length - start,
      }
    }
  }
  return null
}

function eventDate(record: RdapRecord, action: string): string | null {
  const events = Array.isArray(record.events) ? record.events : []
  const dates = events
    .filter(
      (event): event is RdapRecord =>
        isRecord(event) &&
        typeof event.eventAction === 'string' &&
        event.eventAction.toLowerCase() === action &&
        typeof event.eventDate === 'string' &&
        Number.isFinite(Date.parse(event.eventDate)),
    )
    .map((event) => new Date(String(event.eventDate)).toISOString())
    .sort()
  // The earliest registration and the latest of anything else.
  return (action === 'registration' ? dates[0] : dates.at(-1)) ?? null
}

function registrarName(record: RdapRecord): string | null {
  const entities = Array.isArray(record.entities) ? record.entities : []
  for (const entity of entities) {
    if (
      !isRecord(entity) ||
      !Array.isArray(entity.roles) ||
      !entity.roles.includes('registrar')
    ) {
      continue
    }
    const vcard = Array.isArray(entity.vcardArray) ? entity.vcardArray[1] : null
    if (Array.isArray(vcard)) {
      for (const field of vcard) {
        if (
          Array.isArray(field) &&
          field[0] === 'fn' &&
          typeof field[3] === 'string' &&
          field[3].trim()
        ) {
          return field[3].trim().slice(0, 200)
        }
      }
    }
    if (typeof entity.handle === 'string') return entity.handle.slice(0, 200)
  }
  return null
}

function strings(value: unknown, read: (item: unknown) => unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .map(read)
        .filter(
          (item): item is string => typeof item === 'string' && item.length > 0,
        )
        .map((item) => item.toLowerCase().slice(0, 200)),
    ),
  ].slice(0, 20)
}

// Names such as co.uk are registry suffixes, not registered domains, so
// the walk up from a subdomain stops before them. A heuristic: two labels
// under a country code, where the first is a common second-level label.
const SECOND_LEVEL_LABELS = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gov',
  'ltd',
  'me',
  'mil',
  'net',
  'nhs',
  'nic',
  'or',
  'org',
  'plc',
  'sch',
])

function isSecondLevelSuffix(name: string): boolean {
  const labels = name.split('.')
  return (
    labels.length === 2 &&
    (labels[1]?.length ?? 0) === 2 &&
    SECOND_LEVEL_LABELS.has(labels[0] ?? '')
  )
}

export async function lookUpDomainAge(
  input: string,
  fetcher: SitemapFetcher = fetch,
  now = new Date(),
): Promise<DomainAgeResult> {
  const domain = parseDomain(input)
  const empty: DomainAgeResult = {
    schema: 1,
    input: input.trim().slice(0, 253),
    domain,
    state: 'not-found',
    registeredAt: null,
    expiresAt: null,
    updatedAt: null,
    transferredAt: null,
    registrar: null,
    status: [],
    nameservers: [],
    source: { server: null, url: null, checkedAt: now.toISOString() },
  }
  const bootstrap = await fetchJson(
    fetcher,
    BOOTSTRAP_URL,
    DOMAIN_AGE_LIMITS.bootstrapBytes,
    86_400,
  )
  const found = rdapServer(bootstrap.body, domain)
  if (!found) return { ...empty, state: 'no-rdap' }

  // A subdomain is not in the registry, so walk up one label at a time
  // until the registry knows the name.
  const labels = domain.split('.')
  const candidates: string[] = []
  for (let start = 0; labels.length - start > found.suffixLabels; start++) {
    const name = labels.slice(start).join('.')
    if (isSecondLevelSuffix(name)) break
    candidates.push(name)
  }
  for (const name of candidates.slice(0, DOMAIN_AGE_LIMITS.lookups)) {
    const url = `${found.server}domain/${name}`
    const response = await fetchJson(
      fetcher,
      url,
      DOMAIN_AGE_LIMITS.rdapBytes,
      3_600,
    )
    if (response.status === 404 || !isRecord(response.body)) continue
    const record = response.body
    return {
      ...empty,
      domain: name,
      state: 'found',
      registeredAt: eventDate(record, 'registration'),
      expiresAt: eventDate(record, 'expiration'),
      updatedAt: eventDate(record, 'last changed'),
      transferredAt: eventDate(record, 'transfer'),
      registrar: registrarName(record),
      status: strings(record.status, (item) => item),
      nameservers: strings(record.nameservers, (item) =>
        isRecord(item) ? item.ldhName : null,
      ),
      source: { server: found.server, url, checkedAt: now.toISOString() },
    }
  }
  return {
    ...empty,
    source: { server: found.server, url: null, checkedAt: now.toISOString() },
  }
}

export async function handleDomainAge(
  request: Request,
  fetcher: SitemapFetcher = fetch,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!isBrowserRequestFromSameSite(request)) {
    return jsonResponse({ error: 'Not found' }, 404)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return jsonResponse({ error: 'Send a JSON request.' }, 400)
  }
  try {
    const body = await readJson(new Response(request.body), 'The request', {
      maxBytes: DOMAIN_AGE_LIMITS.requestBytes,
    }).catch(() => {
      throw new DomainAgeInputError('Send a JSON object with a domain.')
    })
    if (!isRecord(body) || Object.keys(body).join() !== 'domain') {
      throw new DomainAgeInputError('Send only the domain.')
    }
    return jsonResponse(
      await lookUpDomainAge(String(body.domain ?? ''), fetcher),
    )
  } catch (error) {
    if (error instanceof DomainAgeInputError) {
      return jsonResponse({ error: error.message }, 400)
    }
    if (error instanceof DomainAgeFetchError) {
      return jsonResponse({ error: error.message }, 502)
    }
    return jsonResponse({ error: 'The domain age could not be checked.' }, 503)
  }
}
