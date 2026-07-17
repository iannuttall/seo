import robotsParserModule from 'robots-parser'
import { getDb, hashKey, noteCacheWrite } from '../../storage/database.js'
import { SEO_CRAWLER_USER_AGENT } from '../crawler-identity.js'
import { publicHttpFetch, readBoundedResponseText } from '../http-client.js'
import type { RobotsResolver, RobotsResult } from './types.js'

const MAX_ROBOTS_RESPONSE_BYTES = 1024 * 1024

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
      SEO_CRAWLER_USER_AGENT,
    )
    const matchedLine = lineNumber
      ? input.text.split(/\r?\n/)[lineNumber - 1]?.trim()
      : undefined
    return {
      allowed:
        parsed.isAllowed(input.targetUrl, SEO_CRAWLER_USER_AGENT) ?? true,
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

type RobotsSource = {
  robotsUrl: string
  cache: RobotsResult['cache']
  status?: number
  text?: string
  error?: string
}

export type RobotsFetchOptions = {
  writeCache?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

function resultFromSource(
  source: RobotsSource,
  targetUrl: string,
): RobotsResult {
  if (source.status !== undefined && source.text !== undefined) {
    return resultFromResponse({
      robotsUrl: source.robotsUrl,
      targetUrl,
      status: source.status,
      text: source.text,
      cache: source.cache,
    })
  }
  return {
    allowed: null,
    availability: 'unreachable',
    error: source.error ?? 'robots.txt could not be fetched.',
    cache: source.cache,
    url: source.robotsUrl,
  }
}

async function fetchRobotsSource(
  origin: string,
  refresh: boolean,
  options: RobotsFetchOptions,
): Promise<RobotsSource> {
  const robotsUrl = new URL('/robots.txt', origin).toString()
  const key = hashKey(['robots', robotsUrl])
  if (!refresh) {
    const cached = getDb()
      .prepare(
        'SELECT status, body_blob, expires_at FROM http_cache WHERE url_hash = ?',
      )
      .get(key) as
      | { status?: number; body_blob?: Buffer; expires_at?: number }
      | undefined

    if (
      cached?.body_blob &&
      cached.status !== undefined &&
      cacheableStatus(cached.status) &&
      cached.expires_at &&
      cached.expires_at > Date.now()
    ) {
      return {
        robotsUrl,
        status: cached.status,
        text: cached.body_blob.toString('utf8'),
        cache: 'hit',
      }
    }
  }

  const controller = new AbortController()
  const abort = (): void => controller.abort()
  const timer = setTimeout(abort, options.timeoutMs ?? 20_000)
  if (options.signal?.aborted) controller.abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await publicHttpFetch(robotsUrl, {
      profile: 'bot',
      signal: controller.signal,
    })
    const text = await readBoundedResponseText(
      response,
      MAX_ROBOTS_RESPONSE_BYTES,
      'robots.txt response',
    )
    if (options.writeCache !== false && cacheableStatus(response.status)) {
      getDb()
        .prepare(
          `INSERT OR REPLACE INTO http_cache
          (url_hash, url, status, headers_json, body_blob, etag, fetched_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          key,
          robotsUrl,
          response.status,
          '{}',
          Buffer.from(text),
          null,
          Date.now(),
          Date.now() + 86_400_000,
        )
      noteCacheWrite(Buffer.byteLength(text))
    }
    return {
      robotsUrl,
      status: response.status,
      text,
      cache: refresh ? 'bypass' : 'miss',
    }
  } catch (error) {
    return {
      robotsUrl,
      error: error instanceof Error ? error.message : String(error),
      cache: refresh ? 'bypass' : 'miss',
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

export async function fetchRobots(
  origin: string,
  targetUrl = origin,
  refresh = false,
  options: RobotsFetchOptions = {},
): Promise<RobotsResult> {
  return resultFromSource(
    await fetchRobotsSource(origin, refresh, options),
    targetUrl,
  )
}

export function createRobotsResolver(
  input: {
    refresh?: boolean
    writeCache?: boolean
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): RobotsResolver {
  return createRobotsSession(input).resolve
}

export function createRobotsSession(
  input: {
    refresh?: boolean
    writeCache?: boolean
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): {
  resolve: RobotsResolver
  sitemapUrls: (origin: string) => Promise<string[]>
} {
  const sources = new Map<string, Promise<RobotsSource>>()
  const sourceFor = (origin: string): Promise<RobotsSource> => {
    const normalizedOrigin = new URL(origin).origin
    let source = sources.get(normalizedOrigin)
    if (!source) {
      source = fetchRobotsSource(normalizedOrigin, input.refresh ?? false, {
        writeCache: input.writeCache,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      })
      sources.set(normalizedOrigin, source)
    }
    return source
  }
  return {
    resolve: async (origin, targetUrl) =>
      resultFromSource(await sourceFor(origin), targetUrl),
    sitemapUrls: async (origin) => {
      const source = await sourceFor(origin)
      if (source.status === undefined || source.status >= 300 || !source.text) {
        return []
      }
      const urls = new Set<string>()
      for (const match of source.text.matchAll(
        /^\s*sitemap\s*:\s*(\S+)\s*$/gim,
      )) {
        const value = match[1]?.trim()
        if (!value) continue
        try {
          urls.add(new URL(value).toString())
        } catch {
          // Ignore malformed declarations.
        }
      }
      return [...urls].sort()
    },
  }
}
