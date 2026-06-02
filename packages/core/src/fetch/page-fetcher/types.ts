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

export type NormalizedFetchRateControls = {
  concurrency: number
  intervalCap: number
  intervalMs: number
}

export type RobotsResult = {
  allowed: boolean
  matchedLine?: string
  cache: 'hit' | 'miss' | 'bypass'
  url: string
}
