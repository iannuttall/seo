import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { fileSize, getSeoCliPaths } from '../paths.js'
import type { CacheStats } from '../types.js'

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
  url TEXT NOT NULL,
  verdict TEXT,
  coverage_state TEXT,
  indexing_state TEXT,
  robots_txt_state TEXT,
  page_fetch_state TEXT,
  google_canonical TEXT,
  user_canonical TEXT,
  last_crawl_time TEXT,
  inspected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_index_watch_url ON index_watch_snapshots(site_url, url, inspected_at);

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
`

let db: Database.Database | undefined

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

function initDb(database: Database.Database): void {
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('foreign_keys = ON')
  database.pragma('temp_store = MEMORY')
  database.pragma('mmap_size = 268435456')
  database.pragma('busy_timeout = 5000')
  database.exec(CREATE_SQL)
  ensureColumn(database, 'crawl_pages', 'snapshot_json', 'TEXT')
  ensureColumn(database, 'http_cache', 'metadata_json', 'TEXT')
}

export function getDb(): Database.Database {
  if (db) {
    return db
  }

  const path = getSeoCliPaths().cacheDbFile
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  db = new Database(path)
  initDb(db)
  return db
}

export function hashKey(parts: unknown[]): string {
  const json = JSON.stringify(parts)
  return Buffer.from(json).toString('base64url')
}

export function getCacheStats(): CacheStats {
  const database = getDb()
  const dbPath = getSeoCliPaths().cacheDbFile
  const counts = {
    sites: database.prepare('SELECT COUNT(*) AS count FROM sites').get() as {
      count: number
    },
    gsc_cache: database
      .prepare('SELECT COUNT(*) AS count FROM gsc_cache')
      .get() as { count: number },
    ga4_cache: database
      .prepare('SELECT COUNT(*) AS count FROM ga4_cache')
      .get() as { count: number },
    semrush_cache: database
      .prepare('SELECT COUNT(*) AS count FROM semrush_cache')
      .get() as { count: number },
    http_cache: database
      .prepare('SELECT COUNT(*) AS count FROM http_cache')
      .get() as { count: number },
  }

  return {
    dbPath,
    sizeBytes: existsSync(dbPath) ? fileSize(dbPath) : 0,
    counts: Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, value.count]),
    ),
  }
}

export function clearCache(
  provider?: 'gsc' | 'ga4' | 'semrush' | 'http',
  olderThanMs?: number,
): number {
  const database = getDb()
  const cutoff = olderThanMs ? Date.now() - olderThanMs : undefined

  const tables =
    provider === 'gsc'
      ? ['gsc_cache']
      : provider === 'ga4'
        ? ['ga4_cache']
        : provider === 'semrush'
          ? ['semrush_cache']
          : provider === 'http'
            ? ['http_cache']
            : ['gsc_cache', 'ga4_cache', 'semrush_cache', 'http_cache']

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

  return removed
}
