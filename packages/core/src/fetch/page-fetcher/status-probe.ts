import pRetry, { AbortError } from 'p-retry'
import type { PageFetchResult } from '../../types.js'
import { detectAccessBlock } from '../access-block.js'
import {
  normalizeRateControls,
  queueForHost,
  rateLimitDiagnostics,
  recordHostFetch,
  retryAfterMs,
  waitForHostBackpressure,
} from './rate-controls.js'
import { fetchWithRedirectChain } from './redirects.js'
import { fetchRobots, RobotsAccessError } from './robots.js'
import {
  diagnosticRobotsEvidence,
  pageRobotsEvidence,
} from './robots-evidence.js'
import type { FetchPageOptions } from './types.js'

async function statusProbe(
  url: string,
  opts: FetchPageOptions,
): Promise<PageFetchResult> {
  const startedAt = Date.now()
  const host = new URL(url).host
  const rate = normalizeRateControls(opts.rate)
  const origin = new URL(url).origin
  const robots = opts.robotsResolver
    ? await opts.robotsResolver(origin, url)
    : await fetchRobots(origin, url, opts.refresh ?? false, {
        writeCache: false,
        timeoutMs: opts.timeoutMs,
        signal: opts.signal,
      })
  if (opts.respectRobots && robots.allowed !== true) {
    throw new RobotsAccessError(
      robots.allowed === false ? 'robots-disallowed' : 'robots-deferred',
      robots,
    )
  }

  const beforeFetch = await waitForHostBackpressure(host, rate)
  let attempts = 0
  const result = await pRetry(
    async () => {
      attempts += 1
      const controller = new AbortController()
      const abort = (): void => controller.abort()
      const timer = setTimeout(abort, opts.timeoutMs ?? 20_000)
      if (opts.signal?.aborted) controller.abort()
      else opts.signal?.addEventListener('abort', abort, { once: true })
      try {
        return await fetchWithRedirectChain(url, controller.signal)
      } catch (error) {
        if (opts.signal?.aborted) {
          throw new AbortError(
            error instanceof Error ? error : new Error(String(error)),
          )
        }
        throw error
      } finally {
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', abort)
      }
    },
    { retries: 1 },
  )

  const headers = Object.fromEntries(result.response.headers.entries())
  const accessBlock = detectAccessBlock({
    status: result.response.status,
    headers: result.response.headers,
  })
  await result.response.body?.cancel().catch(() => undefined)
  const durationMs = Date.now() - startedAt
  const backpressure = recordHostFetch({
    host,
    status: result.response.status,
    durationMs,
    retryAfterMs: retryAfterMs(result.response.headers.get('retry-after')),
    rate,
  })

  return {
    url,
    finalUrl: result.response.url || url,
    status: result.response.status,
    headers,
    html: '',
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'bypass',
      fetched: true,
      rendered: false,
      blocked:
        robots.allowed === false ||
        Boolean(accessBlock) ||
        [401, 403, 429].includes(result.response.status),
      durationMs,
      retries: Math.max(0, attempts - 1),
      rateLimit: rateLimitDiagnostics(host, rate),
      backpressure:
        backpressure.status === 'ok' && beforeFetch.status !== 'ok'
          ? beforeFetch
          : backpressure,
      accessBlock,
      robotsTxt: diagnosticRobotsEvidence(robots),
      redirectChain: result.redirectChain,
    },
    warnings: [
      'Status-only health probe. The response body was not downloaded, parsed, rendered, or cached.',
      ...(accessBlock
        ? [
            `${accessBlock.guidance.summary} Identify the crawler as ${accessBlock.crawler.userAgent}.`,
          ]
        : []),
    ],
    robotsTxt: pageRobotsEvidence(robots),
  }
}

export async function fetchPageStatus(
  url: string,
  opts: FetchPageOptions = {},
): Promise<PageFetchResult> {
  const rate = normalizeRateControls(opts.rate)
  const queue = queueForHost(new URL(url).host, rate)
  return (await queue.add(() => statusProbe(url, opts))) as PageFetchResult
}
