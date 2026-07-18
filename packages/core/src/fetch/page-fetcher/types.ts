import type { PageFetchResult } from '../../types.js'

export interface FetchRateControls {
  concurrency?: number
  intervalCap?: number
  intervalMs?: number
  backpressure?: FetchBackpressureControls
}

export interface FetchBackpressureControls {
  slowMs?: number
  verySlowMs?: number
  maxConsecutiveSlow?: number
  maxConsecutiveBlocked?: number
  maxConsecutiveErrors?: number
  cooldownMs?: number
  retryAfterCapMs?: number
}

export interface FetchPageOptions {
  /**
   * `auto` renders only pages that look client-rendered. `on` always attempts
   * rendering. `off` keeps the raw HTTP response. Boolean values are retained
   * for callers written before the explicit modes were introduced.
   */
  js?: JavaScriptRenderingInput
  refresh?: boolean
  /** Read existing cached responses but do not retain this response body. */
  writeCache?: boolean
  timeoutMs?: number
  rate?: FetchRateControls
  signal?: AbortSignal
  respectRobots?: boolean
  /** Reuse one robots.txt policy in memory across a bounded crawl. */
  robotsResolver?: RobotsResolver
  /** Reuse one browser process across related fetches, such as a site crawl. */
  renderer?: PageRenderer
}

export type JavaScriptRenderingMode = 'auto' | 'on' | 'off'

export type JavaScriptRenderingInput = JavaScriptRenderingMode | boolean

export type PageRenderer = {
  render: (
    url: string,
    rate: NormalizedFetchRateControls,
    options: { timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<PageFetchResult>
  close: () => Promise<void>
}

export type NormalizedFetchRateControls = {
  concurrency: number
  intervalCap: number
  intervalMs: number
  backpressure: Required<FetchBackpressureControls>
}

export type RobotsResult = {
  allowed: boolean | null
  availability:
    | 'available'
    | 'absent'
    | 'access-blocked'
    | 'rate-limited'
    | 'unreachable'
  status?: number
  error?: string
  matchedLine?: string
  cache: 'hit' | 'miss' | 'bypass'
  url: string
}

export type RobotsResolver = (
  origin: string,
  targetUrl: string,
) => Promise<RobotsResult>
