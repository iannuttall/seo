import pRetry, { AbortError } from 'p-retry'
import { getDb, hashKey } from '../../storage/database.js'
import type { PageFetchResult } from '../../types.js'
import { publicHttpFetch } from '../http-client.js'
import { fetchRobots } from './robots.js'
import type { NormalizedFetchRateControls } from './types.js'

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
          host,
          ...rate,
        },
      },
      warnings: [],
    }
  }

  const robots = await fetchRobots(new URL(url).origin, refresh)
  let attempts = 0

  const response = await pRetry(
    async () => {
      attempts += 1
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await publicHttpFetch(url, {
          redirect: 'follow',
          signal: controller.signal,
        })
        if (res.status === 429) {
          throw new Error('Received 429 from origin')
        }
        return res
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

  const html = await response.text()
  const headerMap = Object.fromEntries(response.headers.entries())

  db.prepare(
    `INSERT OR REPLACE INTO http_cache
    (url_hash, url, status, headers_json, body_blob, etag, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    key,
    url,
    response.status,
    JSON.stringify(headerMap),
    Buffer.from(html),
    response.headers.get('etag'),
    Date.now(),
    Date.now() + 3_600_000,
  )

  return {
    url,
    finalUrl: response.url,
    status: response.status,
    headers: headerMap,
    html,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: refresh ? 'bypass' : 'miss',
      fetched: true,
      rendered: false,
      blocked: !robots.allowed || [401, 403, 429].includes(response.status),
      durationMs: Date.now() - startedAt,
      retries: Math.max(0, attempts - 1),
      rateLimit: {
        host,
        ...rate,
      },
      robotsTxt: {
        url: robots.url,
        cache: robots.cache,
        allowed: robots.allowed,
      },
    },
    warnings: [],
    robotsTxt: {
      url: new URL('/robots.txt', response.url).toString(),
      allowed: robots.allowed,
      matchedLine: robots.matchedLine,
    },
  }
}
