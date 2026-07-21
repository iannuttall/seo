import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensurePrivateDatabaseFiles } from './database.js'

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

test('missing database files do not prevent startup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'seo-database-missing-'))

  try {
    assert.doesNotThrow(() =>
      ensurePrivateDatabaseFiles(join(directory, 'cache.db')),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
