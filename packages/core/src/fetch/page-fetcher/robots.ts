import robotsParserModule from 'robots-parser'
import { getDb, hashKey } from '../../storage/database.js'
import { BROWSER_USER_AGENT, publicHttpFetch } from '../http-client.js'
import type { RobotsResult } from './types.js'

export class RobotsAccessError extends Error {
  constructor(
    readonly reason: 'robots-disallowed' | 'robots-deferred',
    readonly evidence: RobotsResult,
  ) {
    super(
      reason === 'robots-disallowed'
        ? `robots.txt disallows ${evidence.url}`
        : `robots.txt access decision is deferred for ${evidence.url}`,
    )
    this.name = 'RobotsAccessError'
  }
}

function parseRobots(robotsUrl: string, text: string) {
  return (
    robotsParserModule as unknown as (
      url: string,
      robotstxt: string,
    ) => {
      isAllowed(url: string, ua?: string): boolean | undefined
      getMatchingLineNumber?(url: string, ua?: string): number
    }
  )(robotsUrl, text)
}

function cacheableStatus(status: number): boolean {
  return (
    (status >= 200 && status < 300) ||
    (status >= 400 && status < 500 && status !== 429)
  )
}

function resultFromResponse(input: {
  robotsUrl: string
  targetUrl: string
  status: number
  text: string
  cache: RobotsResult['cache']
}): RobotsResult {
  if (input.status >= 200 && input.status < 300) {
    const parsed = parseRobots(input.robotsUrl, input.text)
    const lineNumber = parsed.getMatchingLineNumber?.(
      input.targetUrl,
      BROWSER_USER_AGENT,
    )
    const matchedLine = lineNumber
      ? input.text.split(/\r?\n/)[lineNumber - 1]?.trim()
      : undefined
    return {
      allowed: parsed.isAllowed(input.targetUrl, BROWSER_USER_AGENT) ?? true,
      availability: 'available',
      status: input.status,
      cache: input.cache,
      url: input.robotsUrl,
      ...(matchedLine ? { matchedLine } : {}),
    }
  }
  if (input.status >= 400 && input.status < 500 && input.status !== 429) {
    return {
      allowed: true,
      availability: [401, 403].includes(input.status)
        ? 'access-blocked'
        : 'absent',
      status: input.status,
      cache: input.cache,
      url: input.robotsUrl,
    }
  }
  return {
    allowed: null,
    availability: input.status === 429 ? 'rate-limited' : 'unreachable',
    status: input.status,
    error: `robots.txt returned HTTP ${input.status}.`,
    cache: input.cache,
    url: input.robotsUrl,
  }
}

export async function fetchRobots(
  origin: string,
  targetUrl = origin,
  refresh = false,
): Promise<RobotsResult> {
  const db = getDb()
  const robotsUrl = new URL('/robots.txt', origin).toString()
  const key = hashKey(['robots', robotsUrl])
  const cached = db
    .prepare(
      'SELECT status, body_blob, expires_at FROM http_cache WHERE url_hash = ?',
    )
    .get(key) as
    | { status?: number; body_blob?: Buffer; expires_at?: number }
    | undefined

  if (
    !refresh &&
    cached?.body_blob &&
    cached.status !== undefined &&
    cacheableStatus(cached.status) &&
    cached.expires_at &&
    cached.expires_at > Date.now()
  ) {
    return resultFromResponse({
      robotsUrl,
      targetUrl,
      status: cached.status,
      text: cached.body_blob.toString('utf8'),
      cache: 'hit',
    })
  }

  try {
    const response = await publicHttpFetch(robotsUrl, {
      profile: 'bot',
    })
    const text = await response.text()
    const result = resultFromResponse({
      robotsUrl,
      targetUrl,
      status: response.status,
      text,
      cache: refresh ? 'bypass' : 'miss',
    })
    if (cacheableStatus(response.status)) {
      db.prepare(
        `INSERT OR REPLACE INTO http_cache
        (url_hash, url, status, headers_json, body_blob, etag, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        key,
        robotsUrl,
        response.status,
        '{}',
        Buffer.from(text),
        null,
        Date.now(),
        Date.now() + 86_400_000,
      )
    }
    return result
  } catch (error) {
    return {
      allowed: null,
      availability: 'unreachable',
      error: error instanceof Error ? error.message : String(error),
      cache: refresh ? 'bypass' : 'miss',
      url: robotsUrl,
    }
  }
}
