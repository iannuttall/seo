import { retryAfterMs } from '../../fetch/page-fetcher/rate-controls.js'
import type { CrawlOneResult } from '../monitoring/crawl-page.js'
import { rateLimitRerunCommand } from './crawl-caveats.js'
import type { CrawlConfig } from './report.js'

// Rate-limit back-off. Each URL is retried a few times, waits double from
// 2 seconds or follow Retry-After up to 30 seconds, and the whole run waits
// at most 3 minutes, so a rate-limited crawl always ends.
const RETRIES_PER_URL = 3
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000
const COOLDOWN_BUDGET_MS = 180_000
const LIMITED_INTERVAL_MS = 1_000
const LIMITED_MAX_INTERVAL_MS = 4_000

// A 429, or a 503 that names a Retry-After, with the wait it asked for.
function rateLimitEvidence(
  result: CrawlOneResult,
  status: number | undefined,
  nowMs: number,
): { retryAfterMs?: number } | undefined {
  if (status !== 429 && status !== 503) return undefined
  const header = retryAfterMs(result.page?.responseHeaders?.['retry-after'])
  // The fetcher keeps Retry-After as a host cool-down; status-only probes
  // carry no headers or diagnostics, so their 503s stay plain errors.
  const cooldownUntil = Date.parse(
    result.page?.fetchDiagnostics?.backpressure?.cooldownUntil ?? '',
  )
  const fromCooldown = Number.isFinite(cooldownUntil)
    ? Math.max(0, cooldownUntil - nowMs)
    : undefined
  const wait = header ?? fromCooldown
  if (status === 503 && wait === undefined) return undefined
  return wait === undefined
    ? {}
    : { retryAfterMs: Math.min(wait, MAX_BACKOFF_MS) }
}

/**
 * Rate-limit state for one crawl. After the first 429 the crawl drops to one
 * request at a time with a per-host interval and never speeds back up.
 */
export class CrawlRateLimit {
  rate: CrawlConfig['fetchRate']
  responses = 0
  skippedUrls = 0
  pendingMs = 0
  spentMs = 0
  #level = 0
  #budgetSpent = false
  readonly #retries = new Map<string, number>()

  constructor(rate: CrawlConfig['fetchRate']) {
    this.rate = rate
  }

  get limited(): boolean {
    return this.responses > 0
  }

  get intervalMs(): number {
    return this.rate.intervalMs ?? LIMITED_INTERVAL_MS
  }

  /** The cool-down before probes that run after the crawl. */
  get settleMs(): number {
    return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.#level)
  }

  /**
   * `retry` requeues the URL after `pendingMs`. `skip` gives it up, and
   * `stop` gives up the rest of the queue too once the budget is spent.
   */
  observe(
    url: string,
    result: CrawlOneResult,
    status: number | undefined,
    nowMs: number,
  ): 'retry' | 'skip' | 'stop' | undefined {
    const evidence = rateLimitEvidence(result, status, nowMs)
    if (!evidence) return undefined
    this.responses += 1
    // One wave of in-flight 429s escalates the back-off once.
    if (this.pendingMs === 0) this.#level += 1
    const step = 2 ** Math.max(0, this.#level - 1)
    const waitMs =
      evidence.retryAfterMs ?? Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * step)
    this.rate = {
      ...this.rate,
      concurrency: 1,
      intervalCap: 1,
      intervalMs: Math.min(
        LIMITED_MAX_INTERVAL_MS,
        Math.max(this.rate.intervalMs ?? 0, LIMITED_INTERVAL_MS * step),
      ),
    }
    const nextMs = Math.max(this.pendingMs, waitMs)
    if (this.spentMs + nextMs > COOLDOWN_BUDGET_MS) this.#budgetSpent = true
    const retries = this.#retries.get(url) ?? 0
    if (!this.#budgetSpent && retries < RETRIES_PER_URL) {
      this.#retries.set(url, retries + 1)
      this.pendingMs = nextMs
      return 'retry'
    }
    this.skippedUrls += 1
    return this.#budgetSpent ? 'stop' : 'skip'
  }

  async settle(
    sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.pendingMs <= 0) return
    await sleep(this.pendingMs, signal)
    this.spentMs += this.pendingMs
    this.pendingMs = 0
  }

  caveatInput(config: CrawlConfig, readPages: number) {
    if (this.skippedUrls === 0) return undefined
    return {
      readPages,
      skippedUrls: this.skippedUrls,
      rerunCommand: rateLimitRerunCommand(config, this.intervalMs),
    }
  }

  warning(): string | undefined {
    if (!this.limited) return undefined
    const plural = (count: number, noun: string) =>
      `${count} ${noun}${count === 1 ? '' : 's'}`
    return `The origin rate limited ${plural(this.responses, 'request')}. The crawl slowed to one request at a time, at least ${Math.round(this.intervalMs / 1000)}s apart, and waited ${Math.round(this.spentMs / 1000)}s in cool-downs${this.skippedUrls > 0 ? `, then left ${plural(this.skippedUrls, 'URL')} unread` : ' before reading every queued URL'}.`
  }
}
