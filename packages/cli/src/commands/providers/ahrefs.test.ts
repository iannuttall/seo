import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../../index.js', import.meta.url))

async function runSeo(
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
      },
      timeout: 10_000,
    })
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const result = error as {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      exitCode: result.code ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  }
}

test('Ahrefs status uses the environment API key without exposing it', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-cache-'))
  try {
    const result = await runSeo(['providers', 'ahrefs', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_AHREFS_API_KEY: 'environment-api-key',
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      connected: true,
      apiVersion: 3,
      credentialSource: 'environment',
      liveCheck: { status: 'not-requested' },
    })
    assert.doesNotMatch(result.stdout, /environment-api-key/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('Ahrefs connect refuses to prompt in JSON or CI mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-cache-'))
  try {
    const result = await runSeo(['providers', 'ahrefs', 'connect', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_AHREFS_API_KEY: '',
    })
    assert.notEqual(result.exitCode, 0)
    const output = JSON.parse(result.stdout) as {
      error: { code: string; message: string }
    }
    assert.equal(output.error.code, 'AUTH_REQUIRED')
    assert.match(output.error.message, /run `seo providers ahrefs connect`/i)
    assert.match(output.error.message, /SEO_AHREFS_API_KEY/)
    assert.equal(result.stderr, '')
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('Ahrefs disconnect leaves an environment API key explicit', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'ahrefs', 'disconnect', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_AHREFS_API_KEY: 'environment-api-key',
      },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      savedCredentialRemoved: true,
      environmentCredential: 'active',
      note: 'The environment variable was not changed. Clear SEO_AHREFS_API_KEY to fully disconnect.',
    })
    assert.doesNotMatch(result.stdout, /environment-api-key/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('Ahrefs limits persist bounded local report work limits', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-cache-'))
  const env = {
    SEO_CONFIG_DIR: configDir,
    SEO_CACHE_DIR: cacheDir,
    SEO_AHREFS_API_KEY: '',
  }
  try {
    const changed = await runSeo(
      [
        'providers',
        'ahrefs',
        'limits',
        '--requests',
        '7',
        '--rows',
        '1200',
        '--json',
      ],
      env,
    )
    assert.equal(changed.exitCode, 0)
    assert.deepEqual(JSON.parse(changed.stdout), {
      provider: 'ahrefs',
      maxRequestsPerReport: 7,
      maxRowsPerReport: 1200,
      changed: true,
      note: 'Paid requests also preflight the live API-unit balance and enforce fixed per-request and per-report unit caps.',
    })

    const stored = await runSeo(
      ['providers', 'ahrefs', 'limits', '--json'],
      env,
    )
    assert.equal(stored.exitCode, 0)
    assert.deepEqual(JSON.parse(stored.stdout), {
      provider: 'ahrefs',
      maxRequestsPerReport: 7,
      maxRowsPerReport: 1200,
      changed: false,
      note: 'Paid requests also preflight the live API-unit balance and enforce fixed per-request and per-report unit caps.',
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('Ahrefs limits reject zero and fractional bounds', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-cache-'))
  const env = {
    SEO_CONFIG_DIR: configDir,
    SEO_CACHE_DIR: cacheDir,
    SEO_AHREFS_API_KEY: '',
  }
  try {
    for (const args of [
      ['--requests', '0'],
      ['--rows', '1.5'],
    ]) {
      const result = await runSeo(
        ['providers', 'ahrefs', 'limits', ...args, '--json'],
        env,
      )
      assert.notEqual(result.exitCode, 0)
      const output = JSON.parse(result.stdout) as {
        error: { code: string; retryable: boolean }
      }
      assert.equal(output.error.code, 'INVALID_INPUT')
      assert.equal(output.error.retryable, false)
      assert.equal(result.stderr, '')
    }
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
