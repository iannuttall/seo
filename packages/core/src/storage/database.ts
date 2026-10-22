import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileSize, getSeoCliPaths } from '../paths.js'
import type { CacheStats } from '../types.js'
import {
  CACHE_MAINTENANCE_WRITE_BYTES,
  CACHE_MAINTENANCE_WRITE_COUNT,
  CACHE_MAX_BYTES,
  cacheLogicalSizes,
  compactCacheDatabase,
  runCacheMaintenance,
} from './cache-maintenance.js'
import Database from './sqlite.js'

const PRIVATE_DATABASE_FILE_MODE = 0o600
const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm'] as const

export function ensurePrivateDatabaseFiles(path: string): void {
  for (const suffix of DATABASE_FILE_SUFFIXES) {
    try {
      chmodSync(`${path}${suffix}`, PRIVATE_DATABASE_FILE_MODE)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
}

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS sites (
  site_url TEXT PRIMARY KEY,
  display_name TEXT,
  permission TEXT,
  added_at INTEGER,
  is_default INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gsc_cache (
  site_url TEXT,
  query_hash TEXT,
  request_json TEXT,
  response_json TEXT,
  row_count INTEGER,
  fetched_at INTEGER,
  expires_at INTEGER,
  PRIMARY KEY(site_url, query_hash)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_gsc_expires ON gsc_cache(expires_at);

CREATE TABLE IF NOT EXISTS ga4_cache (
  property_id TEXT,
  query_hash TEXT,
  request_json TEXT,
  response_json TEXT,
  row_count INTEGER,
  fetched_at INTEGER,
  expires_at INTEGER,
  PRIMARY KEY(property_id, query_hash)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_ga4_expires ON ga4_cache(expires_at);

CREATE TABLE IF NOT EXISTS provider_cache (
  provider TEXT NOT NULL,
  credential_scope TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  row_count INTEGER,
  source_cost_micros INTEGER,
  task_ids_json TEXT NOT NULL DEFAULT '[]',
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(provider, credential_scope, operation, request_hash)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_provider_cache_expires
  ON provider_cache(expires_at);

CREATE TABLE IF NOT EXISTS http_cache (
  url_hash TEXT PRIMARY KEY,
  url TEXT,
  status INTEGER,
  headers_json TEXT,
  body_blob BLOB,
  metadata_json TEXT,
  etag TEXT,
  fetched_at INTEGER,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_http_expires ON http_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_http_fetched ON http_cache(fetched_at);

CREATE TABLE IF NOT EXISTS url_inspection_quota_buckets (
  credential_key TEXT NOT NULL,
  property_site_url TEXT NOT NULL,
  quota_date TEXT NOT NULL,
  limit_count INTEGER NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  reserved_count INTEGER NOT NULL DEFAULT 0,
  minute_window_start INTEGER NOT NULL,
  minute_count INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER,
  last_429_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(credential_key, property_site_url, quota_date)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS url_inspection_quota_reservations (
  id TEXT PRIMARY KEY,
  credential_key TEXT NOT NULL,
  property_site_url TEXT NOT NULL,
  quota_date TEXT NOT NULL,
  count INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  finalized_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_url_inspection_reservations_bucket
  ON url_inspection_quota_reservations(
    credential_key, property_site_url, quota_date, status, expires_at
  );
CREATE INDEX IF NOT EXISTS idx_url_inspection_reservations_minute
  ON url_inspection_quota_reservations(
    credential_key, property_site_url, created_at
  );

CREATE TABLE IF NOT EXISTS url_inspection_cache (
  site_url TEXT NOT NULL,
  url TEXT NOT NULL,
  status_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(site_url, url)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_url_inspection_cache_expires
  ON url_inspection_cache(expires_at);

CREATE TABLE IF NOT EXISTS performance_reports (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  strategy TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_performance_reports_url ON performance_reports(url, strategy, created_at);
CREATE INDEX IF NOT EXISTS idx_performance_reports_expires ON performance_reports(expires_at);
`

let db: Database.Database | undefined
const cacheMaintenanceCounters = new WeakMap<
  Database.Database,
  { writes: number; bytes: number }
>()

function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{
    name: string
  }>
  if (columns.some((item) => item.name === column)) return
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function initDb(database: Database.Database, isNewDatabase: boolean): void {
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('foreign_keys = ON')
  database.pragma('temp_store = MEMORY')
  database.pragma('mmap_size = 268435456')
  database.pragma('busy_timeout = 5000')
  if (isNewDatabase) {
    database.pragma('auto_vacuum = INCREMENTAL')
  }
  const migrate = database.transaction(() => {
    database.exec(CREATE_SQL)
    // Semrush was removed in 0.3.0. Its old cache table goes with it.
    database.exec('DROP TABLE IF EXISTS semrush_cache')
    // The provider spend ledger was removed in 0.3.0. Its tables go too.
    database.exec('DROP TABLE IF EXISTS provider_spend_ledger')
    database.exec('DROP TABLE IF EXISTS provider_spend_notices')
    // Saved crawls, change logs, content groups, index watch and link
    // recovery runs were removed after 0.3.0. Their old tables stay in place
    // so a downgrade to 0.2.41 still finds them, and `seo reset` deletes them.
    ensureColumn(database, 'http_cache', 'metadata_json', 'TEXT')
  })
  migrate.immediate()
  try {
    runCacheMaintenance(database, {
      compact: true,
      allowFullVacuum: true,
    })
  } catch {
    // Another run holds the lock. Maintenance waits for the next open.
  }
}

export function getDb(): Database.Database {
  if (db) {
    return db
  }

  const path = getSeoCliPaths().cacheDbFile
  const isNewDatabase = !existsSync(path)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  ensurePrivateDatabaseFiles(path)
  const opened = new Database(path)
  try {
    ensurePrivateDatabaseFiles(path)
    initDb(opened, isNewDatabase)
    ensurePrivateDatabaseFiles(path)
  } catch (error) {
    opened.close()
    throw error
  }
  db = opened
  return db
}

let memoryDb: Database.Database | undefined

function memoryCache(): Database.Database {
  if (!memoryDb) {
    memoryDb = new Database(':memory:')
    memoryDb.exec(CREATE_SQL)
  }
  return memoryDb
}

// The cache a run reads and writes. The cache only saves repeat calls, so
// when the file cannot be used (another run holds its lock for too long, it
// cannot be read, the disk is full), the rest of this run uses an empty cache
// in memory instead of failing.
export function cacheDb(): Database.Database {
  if (memoryDb) return memoryDb
  try {
    return getDb()
  } catch {
    return memoryCache()
  }
}

// Saves to the cache. A write that fails moves the rest of this run to the
// cache in memory; the result does not depend on it.
export function writeToCache(
  write: (database: Database.Database) => void,
): void {
  try {
    write(cacheDb())
  } catch {
    memoryCache()
  }
}

export function noteCacheWrite(
  sizeBytes = 0,
  database: Database.Database = getDb(),
): void {
  const counter = cacheMaintenanceCounters.get(database) ?? {
    writes: 0,
    bytes: 0,
  }
  counter.writes += 1
  counter.bytes += Math.max(0, sizeBytes)
  cacheMaintenanceCounters.set(database, counter)
  if (
    counter.writes < CACHE_MAINTENANCE_WRITE_COUNT &&
    counter.bytes < CACHE_MAINTENANCE_WRITE_BYTES
  ) {
    return
  }

  runCacheMaintenance(database)
  cacheMaintenanceCounters.delete(database)
}

export function checkDatabaseReadiness(): { dbPath: string } {
  const database = getDb()
  const result = database.prepare('SELECT 1 AS ready').get() as
    | { ready: number }
    | undefined
  if (result?.ready !== 1) {
    throw new Error('The local SQLite database did not return a readiness row.')
  }
  return { dbPath: getSeoCliPaths().cacheDbFile }
}

export function hashKey(parts: unknown[]): string {
  const json = JSON.stringify(parts)
  return Buffer.from(json).toString('base64url')
}

export function getCacheStats(): CacheStats {
  const database = getDb()
  const dbPath = getSeoCliPaths().cacheDbFile
  const logicalSizes = cacheLogicalSizes(database)
  const providerCount = (provider: string): number =>
    (
      database
        .prepare(
          'SELECT COUNT(*) AS count FROM provider_cache WHERE provider = ?',
        )
        .get(provider) as { count: number }
    ).count
  const counts = {
    sites: database.prepare('SELECT COUNT(*) AS count FROM sites').get() as {
      count: number
    },
    gsc_cache: database
      .prepare('SELECT COUNT(*) AS count FROM gsc_cache')
      .get() as { count: number },
    url_inspection_cache: database
      .prepare('SELECT COUNT(*) AS count FROM url_inspection_cache')
      .get() as { count: number },
    google_analytics_cache: database
      .prepare('SELECT COUNT(*) AS count FROM ga4_cache')
      .get() as { count: number },
    provider_cache: { count: providerCount('dataforseo') },
    ahrefs_cache: { count: providerCount('ahrefs') },
    clicky_cache: { count: providerCount('clicky') },
    http_cache: database
      .prepare('SELECT COUNT(*) AS count FROM http_cache')
      .get() as { count: number },
  }

  return {
    dbPath,
    sizeBytes: databaseFootprint(dbPath),
    logicalSizeBytes: Object.values(logicalSizes).reduce(
      (total, size) => total + size,
      0,
    ),
    maxSizeBytes: CACHE_MAX_BYTES,
    counts: Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, value.count]),
    ),
  }
}

function databaseFootprint(path: string): number {
  return [path, `${path}-wal`, `${path}-shm`].reduce(
    (total, file) => total + fileSize(file),
    0,
  )
}

export function clearCache(
  provider?:
    | 'gsc'
    | 'google-analytics'
    | 'dataforseo'
    | 'ahrefs'
    | 'clicky'
    | 'http',
  olderThanMs?: number,
): number {
  const database = getDb()
  const cutoff = olderThanMs ? Date.now() - olderThanMs : undefined

  if (
    provider === 'dataforseo' ||
    provider === 'ahrefs' ||
    provider === 'clicky'
  ) {
    const sql = cutoff
      ? 'DELETE FROM provider_cache WHERE provider = ? AND fetched_at < ?'
      : 'DELETE FROM provider_cache WHERE provider = ?'
    const providerName = provider
    const info = cutoff
      ? database.prepare(sql).run(providerName, cutoff)
      : database.prepare(sql).run(providerName)
    compactCacheDatabase(database, { allowFullVacuum: true })
    return info.changes
  }

  const tables =
    provider === 'gsc'
      ? ['gsc_cache', 'url_inspection_cache']
      : provider === 'google-analytics'
        ? ['ga4_cache']
        : provider === 'http'
          ? ['http_cache']
          : [
              'gsc_cache',
              'url_inspection_cache',
              'ga4_cache',
              'provider_cache',
              'http_cache',
            ]

  let removed = 0

  for (const table of tables) {
    const sql = cutoff
      ? `DELETE FROM ${table} WHERE fetched_at < ?`
      : `DELETE FROM ${table}`
    const info = cutoff
      ? database.prepare(sql).run(cutoff)
      : database.prepare(sql).run()
    removed += info.changes
  }

  compactCacheDatabase(database, { allowFullVacuum: true })

  return removed
}
