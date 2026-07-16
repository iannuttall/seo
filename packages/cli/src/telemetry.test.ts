import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url))

async function runSeo(args: string[], configDir: string) {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      CI: '1',
      NO_UPDATE_NOTIFIER: '1',
      SEO_CONFIG_DIR: configDir,
    },
    timeout: 10_000,
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

test('telemetry settings are explicit and stored locally', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-telemetry-config-'))

  try {
    const help = await runSeo(['telemetry', '--help'], configDir)
    assert.match(help.stdout, /status/)
    assert.match(help.stdout, /enable/)
    assert.match(help.stdout, /disable/)

    const result = await runSeo(['telemetry', 'disable', '--json'], configDir)
    assert.equal(result.stderr, '')
    const state = JSON.parse(
      await readFile(join(configDir, 'telemetry.json'), 'utf8'),
    )
    assert.deepEqual(JSON.parse(result.stdout), {
      enabled: false,
      reason: 'ci',
      stateFile: join(configDir, 'telemetry.json'),
      firstRunAt: state.firstRunAt,
      cohort: state.cohort,
      sentMilestones: [],
    })
    assert.equal(state.telemetryEnabled, false)
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})
