import { createHash } from 'node:crypto'
import { fetch } from 'undici'
import type { ZodType } from 'zod'
import { readConfig } from '../../storage/config.js'
import { getDb, hashKey, noteCacheWrite } from '../../storage/database.js'
import type { ProviderResult } from '../../types.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestText } from '../transport.js'
import { parseSemicolonCsv } from './csv.js'

const BASE_URL = 'https://api.semrush.com/'
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000

export type SemrushTransportOptions = {
  fetch?: ProviderFetch
  baseUrl?: string
  maxResponseBytes?: number
  timeoutMs?: number
}

function estimateUsd(units: number): number {
  return (units / 1000) * 0.05
}

export async function cachedSemrushCall<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  map: (rows: string[][]) => T,
  schema: ZodType<T>,
  ttlMs: number,
  creditsPerLine: number,
  refresh = false,
  transport: SemrushTransportOptions = {},
): Promise<ProviderResult<T>> {
  const config = readConfig()
  const apiKey = config.providers.semrushApiKey
  if (!apiKey) {
    throw new ProviderError({
      provider: 'semrush',
      operation: endpoint,
      code: 'configuration',
      message: 'Semrush credentials are not configured.',
    })
  }

  const safeParams = Object.fromEntries(
    Object.entries({ ...params, type: endpoint }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, string | number>
  const requestParams = { ...safeParams, key: apiKey }
  const credentialScope = createHash('sha256').update(apiKey).digest('hex')

  const db = getDb()
  const queryHash = hashKey([endpoint, safeParams, credentialScope])
  const cached = db
    .prepare(
      'SELECT response_json, credits_used FROM semrush_cache WHERE endpoint = ? AND query_hash = ? AND expires_at > ?',
    )
    .get(endpoint, queryHash, Date.now()) as
    | { response_json?: string; credits_used?: number }
    | undefined

  if (!refresh && cached?.response_json) {
    try {
      const parsed = schema.safeParse(JSON.parse(cached.response_json))
      if (parsed.success) {
        return {
          data: parsed.data,
          usage: {
            provider: 'Semrush',
            units: cached.credits_used ?? 0,
            unitLabel: 'units',
            estimatedUsd: estimateUsd(cached.credits_used ?? 0),
            calls: 1,
            cacheHits: 1,
          },
          cached: true,
        }
      }
    } catch {
      // A corrupt legacy row is a cache miss and will be replaced below.
    }
  }

  const url = new URL(transport.baseUrl ?? BASE_URL)
  url.search = new URLSearchParams(
    Object.entries(requestParams).map(([key, value]): [string, string] => [
      key,
      String(value),
    ]),
  ).toString()

  const text = await providerRequestText({
    provider: 'semrush',
    operation: endpoint,
    url,
    fetch: transport.fetch ?? fetch,
    maxResponseBytes: transport.maxResponseBytes ?? MAX_RESPONSE_BYTES,
    timeoutMs: transport.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: 'never',
  })
  if (text.startsWith('ERROR ::')) {
    throw new ProviderError({
      provider: 'semrush',
      operation: endpoint,
      code: 'remote-error',
      message: 'Semrush rejected the report request.',
    })
  }

  const rows = parseSemicolonCsv(text)
  const parsed = schema.safeParse(map(rows))
  if (!parsed.success) {
    throw new ProviderError({
      provider: 'semrush',
      operation: endpoint,
      code: 'invalid-response',
      message:
        'Semrush returned data that does not match the expected response schema.',
      cause: parsed.error,
    })
  }
  const data = parsed.data
  const credits = Math.max(0, rows.length - 1) * creditsPerLine
  const requestJson = JSON.stringify(safeParams)
  const responseJson = JSON.stringify(data)

  db.prepare(
    `INSERT OR REPLACE INTO semrush_cache
    (endpoint, query_hash, request_json, response_json, credits_used, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    endpoint,
    queryHash,
    requestJson,
    responseJson,
    credits,
    Date.now(),
    Date.now() + ttlMs,
  )
  noteCacheWrite(
    Buffer.byteLength(requestJson) + Buffer.byteLength(responseJson),
  )

  return {
    data,
    usage: {
      provider: 'Semrush',
      units: credits,
      unitLabel: 'units',
      estimatedUsd: estimateUsd(credits),
      calls: 1,
    },
  }
}
