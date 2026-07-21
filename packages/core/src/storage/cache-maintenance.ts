import type Database from './sqlite.js'

const MEBIBYTE = 1024 * 1024

export const CACHE_MAX_BYTES = 256 * MEBIBYTE
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const CACHE_MAINTENANCE_WRITE_BYTES = 16 * MEBIBYTE
export const CACHE_MAINTENANCE_WRITE_COUNT = 50

type CacheTable =
  | 'gsc_cache'
  | 'ga4_cache'
  | 'semrush_cache'
  | 'provider_cache'
  | 'http_cache'
  | 'performance_reports'

export type CacheLimits = Record<CacheTable, number>

export const CACHE_LIMITS: CacheLimits = {
  gsc_cache: 48 * MEBIBYTE,
  ga4_cache: 24 * MEBIBYTE,
  semrush_cache: 16 * MEBIBYTE,
  provider_cache: 32 * MEBIBYTE,
  http_cache: 128 * MEBIBYTE,
  performance_reports: 8 * MEBIBYTE,
}

type CacheRow = {
  fetched_at: number
  size_bytes: number
  [key: string]: string | number
}

type CachePolicy = {
  table: CacheTable
  keys: string[]
  timestamp: 'fetched_at' | 'created_at'
  sizeColumns: string[]
}

const CACHE_POLICIES: CachePolicy[] = [
  {
    table: 'gsc_cache',
    keys: ['site_url', 'query_hash'],
    timestamp: 'fetched_at',
    sizeColumns: ['site_url', 'query_hash', 'request_json', 'response_json'],
  },
  {
    table: 'ga4_cache',
    keys: ['property_id', 'query_hash'],
    timestamp: 'fetched_at',
    sizeColumns: ['property_id', 'query_hash', 'request_json', 'response_json'],
  },
  {
    table: 'semrush_cache',
    keys: ['endpoint', 'query_hash'],
    timestamp: 'fetched_at',
    sizeColumns: ['endpoint', 'query_hash', 'request_json', 'response_json'],
  },
  {
    table: 'provider_cache',
    keys: ['provider', 'credential_scope', 'operation', 'request_hash'],
    timestamp: 'fetched_at',
    sizeColumns: [
      'provider',
      'credential_scope',
      'operation',
      'request_hash',
      'request_json',
      'response_json',
      'task_ids_json',
    ],
  },
  {
    table: 'http_cache',
    keys: ['url_hash'],
    timestamp: 'fetched_at',
    sizeColumns: [
      'url_hash',
      'url',
      'headers_json',
      'body_blob',
      'metadata_json',
      'etag',
    ],
  },
  {
    table: 'performance_reports',
    keys: ['id'],
    timestamp: 'created_at',
    sizeColumns: ['id', 'url', 'strategy', 'report_json'],
  },
]

function sizeExpression(columns: string[]): string {
  return `${columns
    .map((column) => `COALESCE(LENGTH(CAST(${column} AS BLOB)), 0)`)
    .join(' + ')} + 256`
}

function policySize(database: Database.Database, policy: CachePolicy): number {
  const row = database
    .prepare(
      `SELECT COALESCE(SUM(${sizeExpression(policy.sizeColumns)}), 0) AS size_bytes
      FROM ${policy.table}`,
    )
    .get() as { size_bytes?: number } | undefined
  return Number(row?.size_bytes ?? 0)
}

export function cacheLogicalSizes(
  database: Database.Database,
): Record<CacheTable, number> {
  return Object.fromEntries(
    CACHE_POLICIES.map((policy) => [
      policy.table,
      policySize(database, policy),
    ]),
  ) as Record<CacheTable, number>
}

function deleteExpired(
  database: Database.Database,
  policy: CachePolicy,
  now: number,
): number {
  const cutoff = now - CACHE_MAX_AGE_MS
  return database
    .prepare(
      `DELETE FROM ${policy.table}
      WHERE (expires_at IS NOT NULL AND expires_at <= ?)
         OR (${policy.timestamp} IS NOT NULL AND ${policy.timestamp} < ?)`,
    )
    .run(now, cutoff).changes
}

function pruneToLimit(
  database: Database.Database,
  policy: CachePolicy,
  limit: number,
): number {
  if (policySize(database, policy) <= limit) return 0

  const order = [
    `${policy.timestamp} DESC`,
    ...policy.keys.map((key) => `${key} ASC`),
  ].join(', ')
  const rows = database
    .prepare(
      `SELECT ${policy.keys.join(', ')},
        ${policy.timestamp} AS fetched_at,
        ${sizeExpression(policy.sizeColumns)} AS size_bytes
      FROM ${policy.table}
      ORDER BY ${order}`,
    )
    .all() as CacheRow[]
  const remove: CacheRow[] = []
  let retainedBytes = 0

  for (const row of rows) {
    const rowBytes = Number(row.size_bytes)
    if (retainedBytes + rowBytes <= limit) {
      retainedBytes += rowBytes
    } else {
      remove.push(row)
    }
  }

  if (!remove.length) return 0
  const statement = database.prepare(
    `DELETE FROM ${policy.table} WHERE ${policy.keys
      .map((key) => `${key} = ?`)
      .join(' AND ')}`,
  )
  const removeRows = database.transaction(() => {
    let removed = 0
    for (const row of remove) {
      removed += statement.run(...policy.keys.map((key) => row[key])).changes
    }
    return removed
  })
  return removeRows.immediate() as number
}

function pragmaNumber(
  database: Database.Database,
  pragma: string,
  field: string,
): number {
  const result = database.pragma(pragma)
  const row = Array.isArray(result) ? result[0] : result
  if (!row || typeof row !== 'object') return 0
  return Number((row as Record<string, unknown>)[field] ?? 0)
}

export function compactCacheDatabase(
  database: Database.Database,
  options: { allowFullVacuum?: boolean } = {},
): 'incremental' | 'full' | 'skipped' {
  const autoVacuum = pragmaNumber(database, 'auto_vacuum', 'auto_vacuum')
  try {
    if (autoVacuum === 2) {
      database.pragma('incremental_vacuum')
      database.pragma('wal_checkpoint(PASSIVE)')
      return 'incremental'
    }
    if (!options.allowFullVacuum) return 'skipped'

    database.pragma('busy_timeout = 100')
    database.pragma('auto_vacuum = INCREMENTAL')
    database.exec('VACUUM')
    database.pragma('wal_checkpoint(PASSIVE)')
    return 'full'
  } catch {
    return 'skipped'
  } finally {
    database.pragma('busy_timeout = 5000')
  }
}

export type CacheMaintenanceResult = {
  removed: number
  removedByTable: Record<CacheTable, number>
  logicalSizeBytes: number
  sizes: Record<CacheTable, number>
  compaction: 'incremental' | 'full' | 'skipped'
}

export function runCacheMaintenance(
  database: Database.Database,
  options: {
    now?: number
    limits?: Partial<CacheLimits>
    compact?: boolean
    allowFullVacuum?: boolean
  } = {},
): CacheMaintenanceResult {
  const now = options.now ?? Date.now()
  const limits = { ...CACHE_LIMITS, ...options.limits }
  const removedByTable = Object.fromEntries(
    CACHE_POLICIES.map((policy) => [policy.table, 0]),
  ) as Record<CacheTable, number>

  const expire = database.transaction(() => {
    for (const policy of CACHE_POLICIES) {
      removedByTable[policy.table] += deleteExpired(database, policy, now)
    }
  })
  expire.immediate()

  for (const policy of CACHE_POLICIES) {
    removedByTable[policy.table] += pruneToLimit(
      database,
      policy,
      limits[policy.table],
    )
  }

  const removed = Object.values(removedByTable).reduce(
    (total, count) => total + count,
    0,
  )
  const compaction = options.compact
    ? compactCacheDatabase(database, {
        allowFullVacuum: options.allowFullVacuum,
      })
    : 'skipped'
  const sizes = cacheLogicalSizes(database)

  return {
    removed,
    removedByTable,
    logicalSizeBytes: Object.values(sizes).reduce(
      (total, size) => total + size,
      0,
    ),
    sizes,
    compaction,
  }
}
