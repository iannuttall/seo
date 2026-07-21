import { existsSync, mkdirSync } from 'node:fs'
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
import { PROVIDER_SPEND_SCHEMA_SQL } from './provider-spend-schema.js'
import Database from './sqlite.js'

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

CREATE TABLE IF NOT EXISTS semrush_cache (
  endpoint TEXT,
  query_hash TEXT,
  request_json TEXT,
  response_json TEXT,
  credits_used INTEGER,
  fetched_at INTEGER,
  expires_at INTEGER,
  PRIMARY KEY(endpoint, query_hash)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_semrush_expires ON semrush_cache(expires_at);

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

CREATE TABLE IF NOT EXISTS content_groups (
  id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  name TEXT NOT NULL,
  dimension TEXT NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_groups_site ON content_groups(site_url);

CREATE TABLE IF NOT EXISTS seo_changes (
  id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  scope TEXT NOT NULL,
  target TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  changed_at TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seo_changes_site ON seo_changes(site_url, changed_at);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  start_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  limit_count INTEGER NOT NULL,
  url_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_site ON crawl_runs(site_url, start_url, created_at);

CREATE TABLE IF NOT EXISTS crawl_reports (
  id TEXT PRIMARY KEY,
  config_hash TEXT NOT NULL,
  site_url TEXT,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  total_pages INTEGER NOT NULL,
  issue_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  retention_class TEXT NOT NULL DEFAULT 'saved',
  report_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crawl_reports_latest ON crawl_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_reports_site ON crawl_reports(site_url, created_at DESC);

CREATE TABLE IF NOT EXISTS crawl_pages (
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  final_url TEXT NOT NULL,
  status INTEGER NOT NULL,
  title TEXT,
  meta_description TEXT,
  canonical TEXT,
  meta_robots TEXT,
  x_robots_tag TEXT,
  h1 TEXT,
  indexable INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  outgoing_internal_count INTEGER NOT NULL,
  snapshot_json TEXT,
  PRIMARY KEY(run_id, url),
  FOREIGN KEY(run_id) REFERENCES crawl_runs(id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS crawl_recommendations (
  run_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  url TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(run_id, url, category),
  FOREIGN KEY(run_id) REFERENCES crawl_runs(id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_crawl_recommendations_run ON crawl_recommendations(run_id, severity);

CREATE TABLE IF NOT EXISTS index_watch_snapshots (
  id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  root_site_url TEXT NOT NULL,
  property_site_url TEXT NOT NULL,
  url TEXT NOT NULL,
  verdict TEXT,
  coverage_state TEXT,
  indexing_state TEXT,
  robots_txt_state TEXT,
  page_fetch_state TEXT,
  google_canonical TEXT,
  user_canonical TEXT,
  last_crawl_time TEXT,
  inspection_status TEXT NOT NULL DEFAULT 'succeeded',
  error_code TEXT,
  error_message TEXT,
  inspected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_index_watch_url ON index_watch_snapshots(site_url, url, inspected_at);

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

CREATE TABLE IF NOT EXISTS link_recover_runs (
  id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  checked INTEGER NOT NULL,
  recoverable INTEGER NOT NULL,
  high INTEGER NOT NULL,
  medium INTEGER NOT NULL,
  low INTEGER NOT NULL,
  clicks_at_risk REAL NOT NULL,
  impressions_at_risk REAL NOT NULL,
  top_issue TEXT,
  top_url TEXT,
  top_action TEXT
);
CREATE INDEX IF NOT EXISTS idx_link_recover_runs_site ON link_recover_runs(site_url, created_at);

CREATE TABLE IF NOT EXISTS link_recover_items (
  run_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  url TEXT NOT NULL,
  final_url TEXT NOT NULL,
  issue TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  severity TEXT NOT NULL,
  clicks REAL NOT NULL,
  impressions REAL NOT NULL,
  position REAL NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(run_id, url),
  FOREIGN KEY(run_id) REFERENCES link_recover_runs(id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_link_recover_items_url ON link_recover_items(site_url, url, created_at);

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
    database.exec(PROVIDER_SPEND_SCHEMA_SQL)
    database.exec(`DELETE FROM semrush_cache WHERE request_json LIKE '%"key"%'`)
    ensureColumn(database, 'crawl_pages', 'snapshot_json', 'TEXT')
    ensureColumn(database, 'http_cache', 'metadata_json', 'TEXT')
    ensureColumn(
      database,
      'crawl_reports',
      'retention_class',
      "TEXT NOT NULL DEFAULT 'saved'",
    )
    ensureColumn(database, 'index_watch_snapshots', 'root_site_url', 'TEXT')
    ensureColumn(database, 'index_watch_snapshots', 'property_site_url', 'TEXT')
    ensureColumn(database, 'index_watch_snapshots', 'error_code', 'TEXT')
    ensureColumn(database, 'index_watch_snapshots', 'error_message', 'TEXT')
    ensureColumn(
      database,
      'index_watch_snapshots',
      'inspection_status',
      "TEXT NOT NULL DEFAULT 'succeeded'",
    )
    database.exec(`
      UPDATE index_watch_snapshots
      SET root_site_url = COALESCE(root_site_url, site_url),
          property_site_url = COALESCE(property_site_url, site_url)
      WHERE root_site_url IS NULL OR property_site_url IS NULL;
      CREATE INDEX IF NOT EXISTS idx_index_watch_root_url
        ON index_watch_snapshots(root_site_url, url, inspected_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_index_watch_property_url
        ON index_watch_snapshots(property_site_url, url, inspected_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_crawl_reports_retention
        ON crawl_reports(retention_class, site_url, created_at DESC, id DESC);
    `)
  })
  migrate.immediate()
  runCacheMaintenance(database, {
    compact: true,
    allowFullVacuum: true,
  })
}

export function getDb(): Database.Database {
  if (db) {
    return db
  }

  const path = getSeoCliPaths().cacheDbFile
  const isNewDatabase = !existsSync(path)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  db = new Database(path)
  initDb(db, isNewDatabase)
  return db
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
  const counts = {
    sites: database.prepare('SELECT COUNT(*) AS count FROM sites').get() as {
      count: number
    },
    gsc_cache: database
      .prepare('SELECT COUNT(*) AS count FROM gsc_cache')
      .get() as { count: number },
    google_analytics_cache: database
      .prepare('SELECT COUNT(*) AS count FROM ga4_cache')
      .get() as { count: number },
    semrush_cache: database
      .prepare('SELECT COUNT(*) AS count FROM semrush_cache')
      .get() as { count: number },
    provider_cache: database
      .prepare('SELECT COUNT(*) AS count FROM provider_cache')
      .get() as { count: number },
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
  provider?: 'gsc' | 'google-analytics' | 'semrush' | 'dataforseo' | 'http',
  olderThanMs?: number,
): number {
  const database = getDb()
  const cutoff = olderThanMs ? Date.now() - olderThanMs : undefined

  if (provider === 'dataforseo') {
    const sql = cutoff
      ? 'DELETE FROM provider_cache WHERE provider = ? AND fetched_at < ?'
      : 'DELETE FROM provider_cache WHERE provider = ?'
    const info = cutoff
      ? database.prepare(sql).run('dataforseo', cutoff)
      : database.prepare(sql).run('dataforseo')
    compactCacheDatabase(database, { allowFullVacuum: true })
    return info.changes
  }

  const tables =
    provider === 'gsc'
      ? ['gsc_cache']
      : provider === 'google-analytics'
        ? ['ga4_cache']
        : provider === 'semrush'
          ? ['semrush_cache']
          : provider === 'http'
            ? ['http_cache']
            : [
                'gsc_cache',
                'ga4_cache',
                'semrush_cache',
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
