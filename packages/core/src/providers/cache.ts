import { createHash } from 'node:crypto'
import type { ZodType } from 'zod'
import { CACHE_MAX_AGE_MS } from '../storage/cache-maintenance.js'
import { getDb, noteCacheWrite } from '../storage/database.js'
import type Database from '../storage/sqlite.js'
import type { ProviderId } from './contracts.js'
import { ProviderError } from './errors.js'

export type ProviderCacheEntry<T> = {
  data: T
  storedAt: string
  expiresAt: string
  rowCount: number | null
  sourceCostMicros: number | null
  taskIds: string[]
}

type ProviderCacheKey = {
  provider: ProviderId
  credentialScope: string
  operation: string
  request: unknown
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

export function stableProviderRequestJson(request: unknown): string {
  return JSON.stringify(stableValue(request))
}

export function providerCredentialScope(
  provider: ProviderId,
  accountIdentifier: string,
): string {
  return createHash('sha256')
    .update(`${provider}\0${accountIdentifier.trim().toLowerCase()}`)
    .digest('hex')
}

function requestHash(key: ProviderCacheKey, requestJson: string): string {
  return createHash('sha256')
    .update(`${key.provider}\0${key.operation}\0${requestJson}`)
    .digest('hex')
}

function taskIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string =>
            typeof item === 'string' && item.length > 0 && item.length <= 100,
        )
      : []
  } catch {
    return []
  }
}

export function readProviderCache<T>(
  key: ProviderCacheKey,
  schema: ZodType<T>,
  options: { database?: Database.Database; now?: number } = {},
): ProviderCacheEntry<T> | null {
  const database = options.database ?? getDb()
  const now = options.now ?? Date.now()
  const requestJson = stableProviderRequestJson(key.request)
  const hash = requestHash(key, requestJson)
  const row = database
    .prepare(
      `SELECT response_json, row_count, source_cost_micros, task_ids_json,
        fetched_at, expires_at
       FROM provider_cache
       WHERE provider = ? AND credential_scope = ? AND operation = ?
         AND request_hash = ? AND expires_at > ?`,
    )
    .get(key.provider, key.credentialScope, key.operation, hash, now) as
    | {
        response_json: string
        row_count: number | null
        source_cost_micros: number | null
        task_ids_json: string
        fetched_at: number
        expires_at: number
      }
    | undefined
  if (!row) return null

  try {
    const parsed = schema.safeParse(JSON.parse(row.response_json))
    if (!parsed.success) throw parsed.error
    return {
      data: parsed.data,
      storedAt: new Date(row.fetched_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      rowCount: row.row_count,
      sourceCostMicros: row.source_cost_micros,
      taskIds: taskIds(row.task_ids_json),
    }
  } catch {
    database
      .prepare(
        `DELETE FROM provider_cache
         WHERE provider = ? AND credential_scope = ? AND operation = ?
           AND request_hash = ?`,
      )
      .run(key.provider, key.credentialScope, key.operation, hash)
    return null
  }
}

export function writeProviderCache<T>(
  key: ProviderCacheKey,
  input: {
    data: T
    ttlMs: number
    rowCount: number | null
    sourceCostMicros: number | null
    taskIds: string[]
  },
  options: { database?: Database.Database; now?: number } = {},
): ProviderCacheEntry<T> {
  if (
    !Number.isSafeInteger(input.ttlMs) ||
    input.ttlMs <= 0 ||
    input.ttlMs > CACHE_MAX_AGE_MS
  ) {
    throw new ProviderError({
      provider: key.provider,
      operation: key.operation,
      code: 'configuration',
      message: `Provider cache TTL must be between 1 and ${CACHE_MAX_AGE_MS} milliseconds.`,
    })
  }
  const database = options.database ?? getDb()
  const now = options.now ?? Date.now()
  const expiresAt = now + input.ttlMs
  const requestJson = stableProviderRequestJson(key.request)
  const responseJson = JSON.stringify(input.data)
  const normalizedTaskIds = [...new Set(input.taskIds)]
    .filter((id) => id.length > 0 && id.length <= 100)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .slice(0, 20)
  const taskIdsJson = JSON.stringify(normalizedTaskIds)
  database
    .prepare(
      `INSERT OR REPLACE INTO provider_cache (
        provider, credential_scope, operation, request_hash, request_json,
        response_json, row_count, source_cost_micros, task_ids_json,
        fetched_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      key.provider,
      key.credentialScope,
      key.operation,
      requestHash(key, requestJson),
      requestJson,
      responseJson,
      input.rowCount,
      input.sourceCostMicros,
      taskIdsJson,
      now,
      expiresAt,
    )
  noteCacheWrite(
    Buffer.byteLength(requestJson) +
      Buffer.byteLength(responseJson) +
      Buffer.byteLength(taskIdsJson),
    database,
  )
  return {
    data: input.data,
    storedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    rowCount: input.rowCount,
    sourceCostMicros: input.sourceCostMicros,
    taskIds: normalizedTaskIds,
  }
}
