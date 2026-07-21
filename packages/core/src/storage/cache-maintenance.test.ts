import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  CACHE_LIMITS,
  CACHE_MAX_BYTES,
  cacheLogicalSizes,
  runCacheMaintenance,
} from './cache-maintenance.js'
import Database from './sqlite.js'

function cacheDatabase(input: { incremental?: boolean } = {}): {
  database: Database.Database
  path: string
} {
  const path = join(mkdtempSync(join(tmpdir(), 'seo-cache-')), 'cache.db')
  const database = new Database(path)
  if (input.incremental) database.pragma('auto_vacuum = INCREMENTAL')
  database.exec(`
    CREATE TABLE gsc_cache (
      site_url TEXT, query_hash TEXT, request_json TEXT, response_json TEXT,
      fetched_at INTEGER, expires_at INTEGER,
      PRIMARY KEY(site_url, query_hash)
    );
    CREATE TABLE ga4_cache (
      property_id TEXT, query_hash TEXT, request_json TEXT, response_json TEXT,
      fetched_at INTEGER, expires_at INTEGER,
      PRIMARY KEY(property_id, query_hash)
    );
    CREATE TABLE semrush_cache (
      endpoint TEXT, query_hash TEXT, request_json TEXT, response_json TEXT,
      fetched_at INTEGER, expires_at INTEGER,
      PRIMARY KEY(endpoint, query_hash)
    );
    CREATE TABLE provider_cache (
      provider TEXT, credential_scope TEXT, operation TEXT, request_hash TEXT,
      request_json TEXT, response_json TEXT, task_ids_json TEXT,
      fetched_at INTEGER, expires_at INTEGER,
      PRIMARY KEY(provider, credential_scope, operation, request_hash)
    );
    CREATE TABLE http_cache (
      url_hash TEXT PRIMARY KEY, url TEXT, headers_json TEXT, body_blob BLOB,
      metadata_json TEXT, etag TEXT, fetched_at INTEGER, expires_at INTEGER
    );
    CREATE TABLE performance_reports (
      id TEXT PRIMARY KEY, url TEXT, strategy TEXT, report_json TEXT,
      created_at INTEGER, expires_at INTEGER
    );
  `)
  return { database, path }
}

test('per-provider cache limits add up to the global limit', () => {
  assert.equal(
    Object.values(CACHE_LIMITS).reduce((total, size) => total + size, 0),
    CACHE_MAX_BYTES,
  )
})

test('cache maintenance removes expired rows and keeps the newest rows within limits', () => {
  const { database } = cacheDatabase({ incremental: true })
  const insert = database.prepare(
    `INSERT INTO http_cache
    (url_hash, url, headers_json, body_blob, metadata_json, etag, fetched_at, expires_at)
    VALUES (?, ?, '{}', ?, '{}', NULL, ?, ?)`,
  )
  insert.run('expired', 'https://example.com/expired', 'x'.repeat(500), 1, 99)
  insert.run('old', 'https://example.com/old', 'x'.repeat(500), 2, 200)
  insert.run('new', 'https://example.com/new', 'x'.repeat(500), 3, 200)

  const result = runCacheMaintenance(database, {
    now: 100,
    limits: { http_cache: 1_000 },
    compact: true,
  })

  assert.equal(result.removedByTable.http_cache, 2)
  assert.deepEqual(
    database.prepare('SELECT url_hash FROM http_cache ORDER BY url_hash').all(),
    [{ url_hash: 'new' }],
  )
  assert.ok(result.sizes.http_cache <= 1_000)
  database.close()
})

test('provider response cache keeps the newest rows within its own allocation', () => {
  const { database } = cacheDatabase()
  const insert = database.prepare(
    `INSERT INTO provider_cache (
      provider, credential_scope, operation, request_hash, request_json,
      response_json, task_ids_json, fetched_at, expires_at
    ) VALUES ('dataforseo', 'scope', 'keyword-metrics', ?, '{}', ?, '[]', ?, ?)`,
  )
  insert.run('old', 'x'.repeat(500), 1, 1_000)
  insert.run('new', 'x'.repeat(500), 2, 1_000)

  const result = runCacheMaintenance(database, {
    now: 100,
    limits: { provider_cache: 1_000 },
  })

  assert.equal(result.removedByTable.provider_cache, 1)
  assert.deepEqual(
    database.prepare('SELECT request_hash FROM provider_cache').all(),
    [{ request_hash: 'new' }],
  )
  assert.ok(result.sizes.provider_cache <= 1_000)
  database.close()
})

test('cache maintenance compacts files and upgrades legacy auto-vacuum mode', () => {
  const { database, path } = cacheDatabase()
  const insert = database.prepare(
    `INSERT INTO http_cache
    (url_hash, url, headers_json, body_blob, metadata_json, etag, fetched_at, expires_at)
    VALUES (?, ?, '{}', ?, '{}', NULL, ?, ?)`,
  )
  for (let index = 0; index < 100; index += 1) {
    insert.run(
      `page-${index}`,
      `https://example.com/${index}`,
      'x'.repeat(100_000),
      index,
      1_000,
    )
  }
  const before = statSync(path).size

  const result = runCacheMaintenance(database, {
    now: 100,
    limits: { http_cache: 1_000_000 },
    compact: true,
    allowFullVacuum: true,
  })
  const after = statSync(path).size

  assert.equal(result.compaction, 'full')
  assert.ok(result.logicalSizeBytes <= 1_000_000)
  assert.ok(after < before)
  assert.deepEqual(database.pragma('auto_vacuum'), [{ auto_vacuum: 2 }])
  assert.equal(
    Object.values(cacheLogicalSizes(database)).reduce(
      (total, size) => total + size,
      0,
    ),
    result.logicalSizeBytes,
  )
  database.close()
})
