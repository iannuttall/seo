import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../../index.js', import.meta.url))

async function runDoctor(json = false): Promise<{
  exitCode: number
  stderr: string
  stdout: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'seo-doctor-'))
  try {
    await execFileAsync(
      process.execPath,
      [cliPath, 'doctor', ...(json ? ['--json'] : [])],
      {
        env: {
          ...process.env,
          CI: '1',
          NO_UPDATE_NOTIFIER: '1',
          SEO_CACHE_DIR: join(root, 'cache'),
          SEO_CONFIG_DIR: join(root, 'config'),
          SEO_LOG_DIR: join(root, 'logs'),
        },
        timeout: 10_000,
      },
    )
    return { exitCode: 0, stderr: '', stdout: '' }
  } catch (error) {
    const result = error as {
      code?: number
      stderr?: string
      stdout?: string
    }
    return {
      exitCode: result.code ?? 1,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('doctor shows readable failures and exits unsuccessfully', async () => {
  const result = await runDoctor()

  assert.equal(result.exitCode, 1)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /^SEO doctor$/m)
  assert.match(result.stdout, /^FAIL {2}Google login$/m)
  assert.match(result.stdout, /^ {6}Fix {2}Run `seo auth login`/m)
  assert.ok(!result.stdout.includes(String.fromCharCode(27)))
})

test('doctor keeps JSON clean while preserving its failing exit code', async () => {
  const result = await runDoctor(true)

  assert.equal(result.exitCode, 1)
  assert.equal(result.stderr, '')
  const report = JSON.parse(result.stdout) as { ok: boolean }
  assert.equal(report.ok, false)
})
