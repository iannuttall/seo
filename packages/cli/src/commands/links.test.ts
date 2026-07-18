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

test('links command imports a bounded local file as structured JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-links-cli-'))
  const file = join(directory, 'links.json')
  try {
    await writeFile(
      file,
      JSON.stringify([
        {
          sourceUrl: 'https://source.example/a',
          targetUrl: 'https://target.example/a',
          anchorText: 'Example',
        },
      ]),
    )
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [cliPath, 'links', '--file', file, '--json'],
      {
        env: { ...process.env, CI: '1', NO_UPDATE_NOTIFIER: '1' },
      },
    )
    assert.equal(stderr, '')
    const report = JSON.parse(stdout)
    assert.equal(report.provenance.provider, 'json-import')
    assert.equal(report.summary.observedLinks, 1)
    assert.equal(report.links[0].sourceDomain, 'source.example')
    assert.match(report.caveats[0], /not a complete backlink index/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
