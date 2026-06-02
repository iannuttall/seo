import robotsParserModule from 'robots-parser'
import { getDb, hashKey } from '../../storage/database.js'
import { BROWSER_USER_AGENT, publicHttpFetch } from '../http-client.js'
import type { RobotsResult } from './types.js'

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

export async function fetchRobots(
  origin: string,
  refresh = false,
): Promise<RobotsResult> {
  const db = getDb()
  const robotsUrl = new URL('/robots.txt', origin).toString()
  const key = hashKey(['robots', robotsUrl])
  const cached = db
    .prepare('SELECT body_blob, expires_at FROM http_cache WHERE url_hash = ?')
    .get(key) as { body_blob?: Buffer; expires_at?: number } | undefined

  if (
    !refresh &&
    cached?.body_blob &&
    cached.expires_at &&
    cached.expires_at > Date.now()
  ) {
    const text = cached.body_blob.toString('utf8')
    const parsed = parseRobots(robotsUrl, text)
    return {
      allowed: parsed.isAllowed(origin, BROWSER_USER_AGENT) ?? true,
      cache: 'hit',
      url: robotsUrl,
    }
  }

  try {
    const response = await publicHttpFetch(robotsUrl, {
      profile: 'bot',
    })
    const text = await response.text()
    const parsed = parseRobots(robotsUrl, text)
    const result = {
      allowed: parsed.isAllowed(origin, BROWSER_USER_AGENT) ?? true,
      cache: refresh ? ('bypass' as const) : ('miss' as const),
      url: robotsUrl,
    }
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
    return result
  } catch {
    return {
      allowed: true,
      cache: refresh ? 'bypass' : 'miss',
      url: robotsUrl,
    }
  }
}
