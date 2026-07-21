import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { CACHE_MAX_AGE_MS } from '../storage/cache-maintenance.js'
import Database from '../storage/sqlite.js'
import {
  providerCredentialScope,
  readProviderCache,
  stableProviderRequestJson,
  writeProviderCache,
} from './cache.js'

function database(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE provider_cache (
      provider TEXT NOT NULL, credential_scope TEXT NOT NULL,
      operation TEXT NOT NULL, request_hash TEXT NOT NULL,
      request_json TEXT NOT NULL, response_json TEXT NOT NULL,
      row_count INTEGER, source_cost_micros INTEGER,
      task_ids_json TEXT NOT NULL, fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY(provider, credential_scope, operation, request_hash)
    ) WITHOUT ROWID;
  `)
  return db
}

const schema = z.object({ keywords: z.array(z.string()) })

test('provider cache is deterministic and scoped to one credential identity', () => {
  const db = database()
  const firstScope = providerCredentialScope('dataforseo', 'User@Example.test')
  const sameScope = providerCredentialScope('dataforseo', 'user@example.test')
  const otherScope = providerCredentialScope('dataforseo', 'other@example.test')
  const request = { language: 'en', keywords: ['one'], omitted: undefined }
  const key = {
    provider: 'dataforseo' as const,
    credentialScope: firstScope,
    operation: 'keyword-metrics',
    request,
  }
  writeProviderCache(
    key,
    {
      data: { keywords: ['one'] },
      ttlMs: 1_000,
      rowCount: 1,
      sourceCostMicros: 20_100,
      taskIds: ['task-b', 'task-a', 'task-b'],
    },
    { database: db, now: 100 },
  )

  assert.equal(firstScope, sameScope)
  assert.notEqual(firstScope, otherScope)
  assert.deepEqual(
    readProviderCache(
      { ...key, request: { keywords: ['one'], language: 'en' } },
      schema,
      { database: db, now: 101 },
    ),
    {
      data: { keywords: ['one'] },
      storedAt: '1970-01-01T00:00:00.100Z',
      expiresAt: '1970-01-01T00:00:01.100Z',
      rowCount: 1,
      sourceCostMicros: 20_100,
      taskIds: ['task-a', 'task-b'],
    },
  )
  assert.equal(
    readProviderCache({ ...key, credentialScope: otherScope }, schema, {
      database: db,
      now: 101,
    }),
    null,
  )
})

test('provider cache stores no credential or unstable object ordering', () => {
  const db = database()
  const secret = 'never-store-this-password'
  const scope = providerCredentialScope('dataforseo', 'account@example.test')
  writeProviderCache(
    {
      provider: 'dataforseo',
      credentialScope: scope,
      operation: 'keyword-metrics',
      request: { z: 1, a: { two: 2, one: 1 } },
    },
    {
      data: { keywords: ['safe'] },
      ttlMs: CACHE_MAX_AGE_MS,
      rowCount: 1,
      sourceCostMicros: 1,
      taskIds: [],
    },
    { database: db, now: 100 },
  )
  const row = db.prepare('SELECT * FROM provider_cache').get() as Record<
    string,
    unknown
  >
  assert.equal(
    stableProviderRequestJson({ z: 1, a: { two: 2, one: 1 } }),
    '{"a":{"one":1,"two":2},"z":1}',
  )
  assert.equal(JSON.stringify(row).includes(secret), false)
  assert.equal(row.credential_scope, scope)
  assert.match(String(row.request_hash), /^[a-f0-9]{64}$/)
})

test('provider cache rejects expired and corrupt rows', () => {
  const db = database()
  const key = {
    provider: 'dataforseo' as const,
    credentialScope: 'scope',
    operation: 'keyword-metrics',
    request: { keywords: ['one'] },
  }
  writeProviderCache(
    key,
    {
      data: { keywords: ['one'] },
      ttlMs: 10,
      rowCount: 1,
      sourceCostMicros: null,
      taskIds: [],
    },
    { database: db, now: 100 },
  )
  assert.equal(readProviderCache(key, schema, { database: db, now: 110 }), null)

  db.prepare('UPDATE provider_cache SET response_json = ?').run('{bad')
  assert.equal(readProviderCache(key, schema, { database: db, now: 101 }), null)
  assert.equal(
    (
      db.prepare('SELECT COUNT(*) AS count FROM provider_cache').get() as {
        count: number
      }
    ).count,
    0,
  )
})
