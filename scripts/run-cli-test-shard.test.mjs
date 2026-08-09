import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { cliShardFiles, parseShard } from './run-cli-test-shard.mjs'

test('validates CLI shard bounds', () => {
  assert.equal(parseShard('2/3'), '2/3')
  assert.throws(() => parseShard('0/3'), /within the shard total/)
  assert.throws(() => parseShard('4/3'), /within the shard total/)
  assert.throws(() => parseShard('one-of-three'), /form <index>\/<total>/)
})

test('finds deterministic CLI tests without the isolated help suite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-cli-shard-'))
  try {
    await mkdir(join(directory, 'commands'), { recursive: true })
    await Promise.all([
      writeFile(join(directory, 'help.test.js'), ''),
      writeFile(join(directory, 'args.test.js'), ''),
      writeFile(join(directory, 'index.js'), ''),
      writeFile(join(directory, 'commands', 'report.test.js'), ''),
    ])

    assert.deepEqual(await cliShardFiles(directory), [
      join(directory, 'args.test.js'),
      join(directory, 'commands', 'report.test.js'),
    ])
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})
