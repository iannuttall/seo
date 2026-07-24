import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { clearCache, getCacheStats, getDb } from '../../storage/database.js'
import Database from '../../storage/sqlite.js'

const root = mkdtempSync(join(tmpdir(), 'seo-semrush-legacy-cache-'))
const previousCacheDir = process.env.SEO_CACHE_DIR
process.env.SEO_CACHE_DIR = join(root, 'cache')

const cacheFile = join(root, 'cache', 'cache.db')
mkdirSync(dirname(cacheFile), { recursive: true })
const legacyDatabase = new Database(cacheFile)
legacyDatabase.exec(`
  CREATE TABLE semrush_cache (
    endpoint TEXT,
    query_hash TEXT,
    request_json TEXT,
    response_json TEXT,
    credits_used INTEGER,
    fetched_at INTEGER,
    expires_at INTEGER,
    PRIMARY KEY(endpoint, query_hash)
  ) WITHOUT ROWID;
`)
legacyDatabase
  .prepare(
    `INSERT INTO semrush_cache
      (endpoint, query_hash, request_json, response_json, credits_used, fetched_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    'phrase_this',
    'legacy-query',
    JSON.stringify({ key: 'legacy-sem-rush-key', phrase: 'unsafe query' }),
    '[]',
    0,
    Date.now(),
    Date.now() + 60_000,
  )
legacyDatabase.close()

test.after(() => {
  if (previousCacheDir === undefined) delete process.env.SEO_CACHE_DIR
  else process.env.SEO_CACHE_DIR = previousCacheDir
  rmSync(root, { recursive: true, force: true })
})

test('database startup removes legacy Semrush rows that could contain keys', () => {
  const rows = getDb()
    .prepare('SELECT COUNT(*) AS count FROM semrush_cache')
    .get() as { count: number }
  assert.equal(rows.count, 0)
})

test('Semrush cache stats and clearing include only Semrush provider rows', () => {
  const database = getDb()
  const insert = database.prepare(`
    INSERT INTO provider_cache (
      provider, credential_scope, operation, request_hash, request_json,
      response_json, row_count, source_cost_micros, task_ids_json,
      fetched_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const provider of ['semrush', 'dataforseo']) {
    insert.run(
      provider,
      `${provider}-scope`,
      'keyword-metrics',
      `${provider}-hash`,
      '{}',
      '{}',
      1,
      null,
      '[]',
      Date.now(),
      Date.now() + 60_000,
    )
  }

  assert.equal(getCacheStats().counts.semrush_cache, 1)
  assert.equal(getCacheStats().counts.provider_cache, 1)
  assert.equal(clearCache('semrush'), 1)
  assert.equal(getCacheStats().counts.semrush_cache, 0)
  assert.equal(getCacheStats().counts.provider_cache, 1)
})
