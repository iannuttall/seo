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
import { fetchRobots, RobotsAccessError } from './robots.js'
import type { NormalizedFetchRateControls, RobotsResult } from './types.js'

type RedirectHop = NonNullable<
  PageFetchResult['diagnostics']['redirectChain']
>[number]

type CachedPageEvidence = {
  finalUrl: string
  blocked: boolean
  robotsTxt?: PageFetchResult['robotsTxt']
  diagnosticsRobotsTxt?: PageFetchResult['diagnostics']['robotsTxt']
  redirectChain?: PageFetchResult['diagnostics']['redirectChain']
  warnings: string[]
}

function pageRobotsEvidence(
  robots: RobotsResult,
): NonNullable<PageFetchResult['robotsTxt']> {
  return {
    url: robots.url,
    allowed: robots.allowed,
    availability: robots.availability,
    status: robots.status,
    error: robots.error,
    matchedLine: robots.matchedLine,
  }
}

function diagnosticRobotsEvidence(
  robots: RobotsResult,
): NonNullable<PageFetchResult['diagnostics']['robotsTxt']> {
  return {
    url: robots.url,
    cache: robots.cache,
    allowed: robots.allowed,
    availability: robots.availability,
    status: robots.status,
    error: robots.error,
  }
}

export function encodePageFetchCacheEvidence(result: PageFetchResult): string {
  return JSON.stringify({
    finalUrl: result.finalUrl,
    blocked: result.diagnostics.blocked,
    robotsTxt: result.robotsTxt,
    diagnosticsRobotsTxt: result.diagnostics.robotsTxt,
    redirectChain: result.diagnostics.redirectChain,
    warnings: result.warnings,
  } satisfies CachedPageEvidence)
}

export function decodePageFetchCacheEvidence(
  value?: string,
): CachedPageEvidence | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as Partial<CachedPageEvidence>
    if (
      typeof parsed.finalUrl !== 'string' ||
      typeof parsed.blocked !== 'boolean' ||
      !Array.isArray(parsed.warnings)
    ) {
      return undefined
    }
    return parsed as CachedPageEvidence
  } catch {
    return undefined
  }
}

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
  signal?: AbortSignal,
  respectRobots = false,
): Promise<PageFetchResult> {
  const startedAt = Date.now()
  const db = getDb()
  const key = hashKey(['page', url])
  const host = new URL(url).host
  let robots = respectRobots
    ? await fetchRobots(new URL(url).origin, url, refresh)
    : undefined
  if (robots && robots.allowed !== true) {
    throw new RobotsAccessError(
      robots.allowed === false ? 'robots-disallowed' : 'robots-deferred',
      robots,
    )
  }
  const cached = db
    .prepare(
      'SELECT status, headers_json, body_blob, metadata_json, expires_at FROM http_cache WHERE url_hash = ? AND expires_at > ?',
    )
    .get(key, Date.now()) as
    | {
        status: number
        headers_json: string
        body_blob: Buffer
        metadata_json?: string
        expires_at: number
      }
    | undefined

  if (!refresh && cached) {
    const evidence = decodePageFetchCacheEvidence(cached.metadata_json)
    return {
      url,
      finalUrl: evidence?.finalUrl ?? url,
      status: cached.status,
      headers: JSON.parse(cached.headers_json) as Record<string, string>,
      html: cached.body_blob.toString('utf8'),
      usedJs: false,
      diagnostics: {
        source: 'cache',
        cache: 'hit',
        fetched: false,
        rendered: false,
        blocked: evidence?.blocked ?? [401, 403, 429].includes(cached.status),
        durationMs: Date.now() - startedAt,
        retries: 0,
        rateLimit: {
          ...rateLimitDiagnostics(host, rate),
        },
        backpressure: hostBackpressureSnapshot(host),
        robotsTxt: robots
          ? diagnosticRobotsEvidence(robots)
          : evidence?.diagnosticsRobotsTxt
            ? { ...evidence.diagnosticsRobotsTxt, cache: 'hit' }
            : undefined,
        redirectChain: evidence?.redirectChain,
      },
      warnings: evidence?.warnings ?? [
        'Cached page predates redirect and robots diagnostics. Rerun with refresh before making technical decisions.',
      ],
      robotsTxt: robots ? pageRobotsEvidence(robots) : evidence?.robotsTxt,
    }
  }

  robots ??= await fetchRobots(new URL(url).origin, url, refresh)
  const beforeFetch = await waitForHostBackpressure(host, rate)
  let attempts = 0

  const response = await pRetry(
    async () => {
      attempts += 1
      const controller = new AbortController()
      const abort = () => controller.abort()
      const timer = setTimeout(abort, timeoutMs)
      if (signal?.aborted) {
        controller.abort()
      } else {
        signal?.addEventListener('abort', abort, { once: true })
      }
      try {
        return await fetchWithRedirectChain(url, controller.signal)
      } catch (error) {
        if (error instanceof Error && /4\d\d/.test(error.message)) {
          throw new AbortError(error)
        }
        throw error
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
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

  const result: PageFetchResult = {
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
        robots.allowed === false ||
        [401, 403, 429].includes(response.response.status),
      durationMs,
      retries: Math.max(0, attempts - 1),
      rateLimit: {
        ...rateLimitDiagnostics(host, rate),
      },
      backpressure:
        backpressure.status === 'ok' && beforeFetch.status !== 'ok'
          ? beforeFetch
          : backpressure,
      robotsTxt: diagnosticRobotsEvidence(robots),
      redirectChain: response.redirectChain,
    },
    warnings:
      robots.allowed === null
        ? [
            `robots.txt availability is unknown${robots.status ? ` after HTTP ${robots.status}` : ''}; this fetch does not prove crawler access is allowed.`,
          ]
        : [],
    robotsTxt: pageRobotsEvidence(robots),
  }

  db.prepare(
    `INSERT OR REPLACE INTO http_cache
    (url_hash, url, status, headers_json, body_blob, metadata_json, etag, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    key,
    url,
    response.response.status,
    JSON.stringify(headerMap),
    Buffer.from(html),
    encodePageFetchCacheEvidence(result),
    response.response.headers.get('etag'),
    Date.now(),
    Date.now() + 3_600_000,
  )

  return result
}
