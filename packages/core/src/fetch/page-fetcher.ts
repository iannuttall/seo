import PQueue from 'p-queue'
import pRetry, { AbortError } from 'p-retry'
import robotsParserModule from 'robots-parser'
import { getDb, hashKey } from '../storage/database.js'
import type { PageFetchResult } from '../types.js'
import { BROWSER_USER_AGENT, publicHttpFetch } from './http-client.js'

const HOST_QUEUES = new Map<string, PQueue>()

export interface FetchPageOptions {
  js?: boolean | 'auto'
  refresh?: boolean
  timeoutMs?: number
}

function queueForHost(host: string): PQueue {
  const existing = HOST_QUEUES.get(host)
  if (existing) {
    return existing
  }

  const queue = new PQueue({ concurrency: 4 })
  HOST_QUEUES.set(host, queue)
  return queue
}

function looksLikeSpa(html: string): boolean {
  const lower = html.toLowerCase()
  return (
    /<div[^>]+id="root"[^>]*>\s*<\/div>/.test(lower) ||
    /<div[^>]+id="__next"[^>]*>\s*<\/div>/.test(lower) ||
    /<app-root[^>]*>\s*<\/app-root>/.test(lower) ||
    /enable javascript/i.test(lower)
  )
}

async function fetchRobots(
  origin: string,
  refresh = false,
): Promise<{ allowed: boolean; matchedLine?: string }> {
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
    const parsed = (
      robotsParserModule as unknown as (
        url: string,
        robotstxt: string,
      ) => {
        isAllowed(url: string, ua?: string): boolean | undefined
      }
    )(robotsUrl, text)
    return { allowed: parsed.isAllowed(origin, BROWSER_USER_AGENT) ?? true }
  }

  try {
    const response = await publicHttpFetch(robotsUrl, {
      profile: 'bot',
    })
    const text = await response.text()
    const parsed = (
      robotsParserModule as unknown as (
        url: string,
        robotstxt: string,
      ) => {
        isAllowed(url: string, ua?: string): boolean | undefined
        getMatchingLineNumber(url: string, ua?: string): number
      }
    )(robotsUrl, text)
    const result = {
      allowed: parsed.isAllowed(origin, BROWSER_USER_AGENT) ?? true,
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
    return { allowed: true }
  }
}

async function fetchPlain(
  url: string,
  refresh = false,
  timeoutMs = 20_000,
): Promise<PageFetchResult> {
  const db = getDb()
  const key = hashKey(['page', url])
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
      warnings: [],
    }
  }

  const robots = await fetchRobots(new URL(url).origin, refresh)

  const response = await pRetry(
    async () => {
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
    warnings: [],
    robotsTxt: {
      url: new URL('/robots.txt', response.url).toString(),
      allowed: robots.allowed,
      matchedLine: robots.matchedLine,
    },
  }
}

async function fetchWithPlaywright(url: string): Promise<PageFetchResult> {
  const playwright = await import('playwright').catch(() => undefined)
  if (!playwright?.chromium) {
    throw new Error(
      'Playwright is not installed. Run `pnpm add -w playwright` and `npx playwright install chromium`.',
    )
  }

  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ userAgent: BROWSER_USER_AGENT })
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    const html = await page.content()
    return {
      url,
      finalUrl: page.url(),
      status: response?.status() ?? 200,
      headers: {},
      html,
      usedJs: true,
      warnings: [],
    }
  } finally {
    await browser.close()
  }
}

export async function fetchPage(
  url: string,
  opts: FetchPageOptions = {},
): Promise<PageFetchResult> {
  const queue = queueForHost(new URL(url).host)
  return (await queue.add<PageFetchResult>(async () => {
    const first = await fetchPlain(url, opts.refresh, opts.timeoutMs)
    const warnings = [...first.warnings]
    const lowWordCount = first.html.split(/\s+/).length < 150
    const shouldRetryJs =
      opts.js === true ||
      (opts.js === 'auto' && (lowWordCount || looksLikeSpa(first.html)))

    if (!shouldRetryJs) {
      if (opts.js === 'auto' && (lowWordCount || looksLikeSpa(first.html))) {
        warnings.push('Page looks like SPA - re-run with --js to render.')
      }
      return { ...first, warnings }
    }

    try {
      const rendered = await fetchWithPlaywright(url)
      return { ...rendered, warnings }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : 'JS rendering failed.',
      )
      return { ...first, warnings }
    }
  })) as PageFetchResult
}
