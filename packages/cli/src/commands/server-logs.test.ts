import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

test('server-logs analyzes a local file as structured JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-server-logs-cli-'))
  const file = join(directory, 'access.log')
  try {
    await writeFile(
      file,
      '127.0.0.1 - - [10/Oct/2025:13:55:36 +0000] "GET /docs HTTP/1.1" 200 123 "-" "Googlebot/2.1"\n',
    )
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [cliPath, 'server-logs', 'analyze', '--file', file, '--json'],
      { env: { ...process.env, CI: '1', NO_UPDATE_NOTIFIER: '1' } },
    )
    assert.equal(stderr, '')
    const report = JSON.parse(stdout)
    assert.equal(report.provenance.source, 'local-server-log')
    assert.equal(report.summary.crawlerRows, 1)
    assert.equal(report.crawlers[0].family, 'Googlebot')
    assert.match(report.caveats[0], /spoofed/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('server-logs is discoverable in the full help inventory', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [cliPath, 'help', 'all'],
    { env: { ...process.env, CI: '1', NO_UPDATE_NOTIFIER: '1' } },
  )
  assert.equal(stderr, '')
  assert.match(stdout, /seo server-logs analyze/)
})
