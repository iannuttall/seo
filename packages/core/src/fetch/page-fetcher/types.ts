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
  js?: boolean | 'auto'
  refresh?: boolean
  timeoutMs?: number
  rate?: FetchRateControls
  signal?: AbortSignal
}

export type NormalizedFetchRateControls = {
  concurrency: number
  intervalCap: number
  intervalMs: number
  backpressure: Required<FetchBackpressureControls>
}

export type RobotsResult = {
  allowed: boolean
  matchedLine?: string
  cache: 'hit' | 'miss' | 'bypass'
  url: string
}
