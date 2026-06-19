import pRetry, { AbortError } from 'p-retry'
import { getDb, hashKey } from '../../storage/database.js'
import type { PageFetchResult } from '../../types.js'
import { publicHttpFetch } from '../http-client.js'
import {
  hostBackpressureSnapshot,
  rateLimitDiagnostics,
  recordHostFetch,
  retryAfterMs,
  waitForHostBackpressure,
} from './rate-controls.js'
import { fetchRobots } from './robots.js'
import type { NormalizedFetchRateControls } from './types.js'

type RedirectHop = NonNullable<
  PageFetchResult['diagnostics']['redirectChain']
>[number]

async function fetchWithRedirectChain(
  url: string,
  signal: AbortSignal,
): Promise<{
  response: Awaited<ReturnType<typeof publicHttpFetch>>
  redirectChain: RedirectHop[]
}> {
  const redirectChain: RedirectHop[] = []
  let currentUrl = url

  for (let redirectCount = 0; redirectCount <= 10; redirectCount += 1) {
    const response = await publicHttpFetch(currentUrl, {
      redirect: 'manual',
      signal,
    })
    const location = response.headers.get('location')

    if (response.status < 300 || response.status >= 400 || !location) {
      return { response, redirectChain }
    }

    const nextUrl = new URL(location, currentUrl).toString()
    redirectChain.push({
      url: currentUrl,
      status: response.status,
      location: nextUrl,
    })
    await response.body?.cancel().catch(() => undefined)
    currentUrl = nextUrl
  }

  throw new Error(`Too many redirects for ${url}`)
}

export async function fetchPlain(
  url: string,
  refresh = false,
  timeoutMs = 20_000,
  rate: NormalizedFetchRateControls,
): Promise<PageFetchResult> {
  const startedAt = Date.now()
  const db = getDb()
  const key = hashKey(['page', url])
  const host = new URL(url).host
  const cached = db
    .prepare(
      'SELECT status, headers_json, body_blob, expires_at FROM http_cache WHERE url_hash = ? AND expires_at > ?',
    )
    .get(key, Date.now()) as
    | {
        status: number
        headers_json: string
        body_blob: Buffer
        expires_at: number
      }
    | undefined

  if (!refresh && cached) {
    return {
      url,
      finalUrl: url,
      status: cached.status,
      headers: JSON.parse(cached.headers_json) as Record<string, string>,
      html: cached.body_blob.toString('utf8'),
      usedJs: false,
      diagnostics: {
        source: 'cache',
        cache: 'hit',
        fetched: false,
        rendered: false,
        blocked: [401, 403, 429].includes(cached.status),
        durationMs: Date.now() - startedAt,
        retries: 0,
        rateLimit: {
          ...rateLimitDiagnostics(host, rate),
        },
        backpressure: hostBackpressureSnapshot(host),
      },
      warnings: [],
    }
  }

  const robots = await fetchRobots(new URL(url).origin, url, refresh)
  const beforeFetch = await waitForHostBackpressure(host, rate)
  let attempts = 0

  const response = await pRetry(
    async () => {
      attempts += 1
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await fetchWithRedirectChain(url, controller.signal)
      } catch (error) {
        if (error instanceof Error && /4\d\d/.test(error.message)) {
          throw new AbortError(error)
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
    { retries: 2 },
  )

  const html = await response.response.text()
  const headerMap = Object.fromEntries(response.response.headers.entries())
  const durationMs = Date.now() - startedAt
  const backpressure = recordHostFetch({
    host,
    status: response.response.status,
    durationMs,
    retryAfterMs: retryAfterMs(response.response.headers.get('retry-after')),
    rate,
  })

  db.prepare(
    `INSERT OR REPLACE INTO http_cache
    (url_hash, url, status, headers_json, body_blob, etag, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    key,
    url,
    response.response.status,
    JSON.stringify(headerMap),
    Buffer.from(html),
    response.response.headers.get('etag'),
    Date.now(),
    Date.now() + 3_600_000,
  )

  return {
    url,
    finalUrl: response.response.url,
    status: response.response.status,
    headers: headerMap,
    html,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: refresh ? 'bypass' : 'miss',
      fetched: true,
      rendered: false,
      blocked:
        !robots.allowed || [401, 403, 429].includes(response.response.status),
      durationMs,
      retries: Math.max(0, attempts - 1),
      rateLimit: {
        ...rateLimitDiagnostics(host, rate),
      },
      backpressure:
        backpressure.status === 'ok' && beforeFetch.status !== 'ok'
          ? beforeFetch
          : backpressure,
      robotsTxt: {
        url: robots.url,
        cache: robots.cache,
        allowed: robots.allowed,
      },
      redirectChain: response.redirectChain,
    },
    warnings: [],
    robotsTxt: {
      url: new URL('/robots.txt', response.response.url).toString(),
      allowed: robots.allowed,
      matchedLine: robots.matchedLine,
    },
  }
}
