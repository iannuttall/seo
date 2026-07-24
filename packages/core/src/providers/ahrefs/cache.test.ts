import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { clearCache, getCacheStats, getDb } from '../../storage/database.js'

const root = mkdtempSync(join(tmpdir(), 'seo-ahrefs-cache-'))
const previousCacheDir = process.env.SEO_CACHE_DIR
process.env.SEO_CACHE_DIR = root

test.after(() => {
  if (previousCacheDir === undefined) delete process.env.SEO_CACHE_DIR
  else process.env.SEO_CACHE_DIR = previousCacheDir
  rmSync(root, { recursive: true, force: true })
})

test('Ahrefs cache stats and clearing stay separate from other providers', () => {
  const database = getDb()
  const insert = database.prepare(`
    INSERT INTO provider_cache (
      provider, credential_scope, operation, request_hash, request_json,
      response_json, row_count, source_cost_micros, task_ids_json,
      fetched_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const provider of ['ahrefs', 'dataforseo']) {
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

  assert.equal(getCacheStats().counts.ahrefs_cache, 1)
  assert.equal(getCacheStats().counts.provider_cache, 1)
  assert.equal(clearCache('ahrefs'), 1)
  assert.equal(getCacheStats().counts.ahrefs_cache, 0)
  assert.equal(getCacheStats().counts.provider_cache, 1)
})
