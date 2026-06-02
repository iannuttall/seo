import PQueue from 'p-queue'
import pRetry, { AbortError } from 'p-retry'
import robotsParserModule from 'robots-parser'
import { getDb, hashKey } from '../storage/database.js'
import type { PageFetchResult } from '../types.js'
import { BROWSER_USER_AGENT, publicHttpFetch } from './http-client.js'

const HOST_QUEUES = new Map<string, PQueue>()

export interface FetchRateControls {
  concurrency?: number
  intervalCap?: number
  intervalMs?: number
}

export interface FetchPageOptions {
  js?: boolean | 'auto'
  refresh?: boolean
  timeoutMs?: number
  rate?: FetchRateControls
}

type NormalizedFetchRateControls = {
  concurrency: number
  intervalCap: number
  intervalMs: number
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeRateControls(
  rate?: FetchRateControls,
): NormalizedFetchRateControls {
  return {
    concurrency: rate?.concurrency ?? numberEnv('SEO_FETCH_CONCURRENCY', 4),
    intervalCap: rate?.intervalCap ?? numberEnv('SEO_FETCH_INTERVAL_CAP', 4),
    intervalMs: rate?.intervalMs ?? numberEnv('SEO_FETCH_INTERVAL_MS', 1000),
  }
}

function queueForHost(host: string, rate: NormalizedFetchRateControls): PQueue {
  const key = `${host}:${rate.concurrency}:${rate.intervalCap}:${rate.intervalMs}`
  const existing = HOST_QUEUES.get(key)
  if (existing) {
    return existing
  }

  const queue = new PQueue({
    concurrency: rate.concurrency,
    intervalCap: rate.intervalCap,
    interval: rate.intervalMs,
  })
  HOST_QUEUES.set(key, queue)
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
): Promise<{
  allowed: boolean
  matchedLine?: string
  cache: 'hit' | 'miss' | 'bypass'
  url: string
}> {
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

async function fetchPlain(
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

async function fetchWithPlaywright(
  url: string,
  rate: NormalizedFetchRateControls,
): Promise<PageFetchResult> {
  const startedAt = Date.now()
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
      diagnostics: {
        source: 'rendered',
        cache: 'bypass',
        fetched: true,
        rendered: true,
        blocked: [401, 403, 429].includes(response?.status() ?? 200),
        durationMs: Date.now() - startedAt,
        retries: 0,
        rateLimit: {
          host: new URL(url).host,
          ...rate,
        },
      },
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
  const rate = normalizeRateControls(opts.rate)
  const queue = queueForHost(new URL(url).host, rate)
  return (await queue.add<PageFetchResult>(async () => {
    const first = await fetchPlain(url, opts.refresh, opts.timeoutMs, rate)
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
      const rendered = await fetchWithPlaywright(url, rate)
      return {
        ...rendered,
        diagnostics: {
          ...rendered.diagnostics,
          robotsTxt: first.diagnostics.robotsTxt,
        },
        warnings,
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : 'JS rendering failed.',
      )
      return { ...first, warnings }
    }
  })) as PageFetchResult
}
