import type { ProviderFetch } from '../transport.js'
import type { DataForSeoCredentials } from './credentials.js'

export type DataForSeoAccountSnapshot = {
  provider: 'dataforseo'
  login: string
  timezone: string | null
  balanceMicros: number | null
  depositedMicros: number | null
  apiVersion: string | null
  requestCostMicros: number
  taskIds: string[]
  observedAt: string
}

export type DataForSeoClientOptions = {
  fetch?: ProviderFetch
  credentials?: () =>
    | DataForSeoCredentials
    | undefined
    | Promise<DataForSeoCredentials | undefined>
  baseUrl?: string
  timeoutMs?: number
  maxResponseBytes?: number
  now?: () => Date
}
