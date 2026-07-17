import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pruneLogs } from './log-retention.js'

test('log pruning rotates large files and removes old and excess logs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'seo-logs-'))
  const now = 1_800_000_000_000
  const active = join(directory, 'technical-watch.log')
  const old = join(directory, 'old.log')
  const extra = join(directory, 'extra.log')
  writeFileSync(active, 'x'.repeat(2_000))
  writeFileSync(old, 'old')
  writeFileSync(extra, 'x'.repeat(900))
  utimesSync(old, new Date(now - 10_000), new Date(now - 10_000))
  utimesSync(extra, new Date(now - 100), new Date(now - 100))
  utimesSync(active, new Date(now), new Date(now))

  const result = pruneLogs({
    directory,
    now,
    maxFileBytes: 1_000,
    maxTotalBytes: 2_500,
    maxAgeMs: 1_000,
  })
  const files = readdirSync(directory).sort()

  assert.equal(result.rotated, 1)
  assert.equal(result.removed, 2)
  assert.ok(files.some((file) => /^technical-watch\.\d+\.log$/.test(file)))
  assert.ok(!files.includes('technical-watch.log'))
  assert.ok(!files.includes('old.log'))
  assert.ok(!files.includes('extra.log'))
  assert.ok(result.sizeBytes <= 2_500)
})
