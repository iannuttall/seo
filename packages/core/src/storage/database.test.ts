import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import { ensurePrivateDatabaseFiles, getDb } from './database.js'
import Database from './sqlite.js'

test('database files and sidecars are restricted to the current user', () => {
  const directory = mkdtempSync(join(tmpdir(), 'seo-database-permissions-'))
  const path = join(directory, 'cache.db')
  const files = [path, `${path}-wal`, `${path}-shm`]

  try {
    for (const file of files) {
      writeFileSync(file, '')
      chmodSync(file, 0o644)
    }

    ensurePrivateDatabaseFiles(path)

    for (const file of files) {
      assert.equal(statSync(file).mode & 0o777, 0o600)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('opening the cache drops tables left by removed features', () => {
  const path = getSeoCliPaths().cacheDbFile
  mkdirSync(dirname(path), { recursive: true })
  const old = new Database(path)
  old.exec(`
    CREATE TABLE semrush_cache (key TEXT PRIMARY KEY);
    CREATE TABLE provider_spend_ledger (id TEXT PRIMARY KEY);
    CREATE TABLE provider_spend_notices (provider TEXT PRIMARY KEY);
  `)
  old.close()

  const tables = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>
  const names = tables.map((table) => table.name)

  assert.ok(names.includes('http_cache'))
  for (const removed of [
    'semrush_cache',
    'provider_spend_ledger',
    'provider_spend_notices',
  ]) {
    assert.equal(names.includes(removed), false, removed)
  }
})
