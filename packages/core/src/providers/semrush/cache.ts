import { fetch } from 'undici'
import { readBoundedResponseText } from '../../fetch/http-client.js'
import { readConfig } from '../../storage/config.js'
import { getDb, hashKey, noteCacheWrite } from '../../storage/database.js'
import type { ProviderResult } from '../../types.js'
import { parseSemicolonCsv } from './csv.js'

const BASE_URL = 'https://api.semrush.com/'
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024

function estimateUsd(units: number): number {
  return (units / 1000) * 0.05
}

export async function cachedSemrushCall<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  map: (rows: string[][]) => T,
  ttlMs: number,
  creditsPerLine: number,
  refresh = false,
): Promise<ProviderResult<T>> {
  const config = readConfig()
  const apiKey = config.providers.semrushApiKey
  if (!apiKey) {
    throw new Error('Semrush API key missing. Add it to config.json first.')
  }

  const requestParams = Object.fromEntries(
    Object.entries({ ...params, key: apiKey, type: endpoint }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, string>

  const db = getDb()
  const queryHash = hashKey([endpoint, requestParams])
  const cached = db
    .prepare(
      'SELECT response_json, credits_used FROM semrush_cache WHERE endpoint = ? AND query_hash = ? AND expires_at > ?',
    )
    .get(endpoint, queryHash, Date.now()) as
    | { response_json?: string; credits_used?: number }
    | undefined

  if (!refresh && cached?.response_json) {
    return {
      data: JSON.parse(cached.response_json) as T,
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

  const url = new URL(BASE_URL)
  url.search = new URLSearchParams(requestParams).toString()

  const response = await fetch(url)
  const text = await readBoundedResponseText(
    response,
    MAX_RESPONSE_BYTES,
    'Semrush response',
  )
  if (!response.ok || text.startsWith('ERROR ::')) {
    throw new Error(text || `Semrush request failed with ${response.status}.`)
  }

  const rows = parseSemicolonCsv(text)
  const data = map(rows)
  const credits = Math.max(0, rows.length - 1) * creditsPerLine
  const requestJson = JSON.stringify(requestParams)
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
