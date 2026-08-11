import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

test('SerpBase status uses environment credentials without exposing them', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-cache-'))
  try {
    const result = await runSeo(['providers', 'serpbase', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_SERPBASE_API_KEY: 'environment-secret',
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      connected: true,
      credentialSource: 'environment',
      liveCheck: { status: 'not-requested' },
    })
    assert.doesNotMatch(result.stdout, /environment-secret/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('SerpBase connect refuses to prompt in JSON or CI mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'serpbase', 'connect', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    assert.notEqual(result.exitCode, 0)
    const output = JSON.parse(result.stdout) as {
      error: { code: string; message: string }
    }
    assert.equal(output.error.code, 'AUTH_REQUIRED')
    assert.match(output.error.message, /seo providers serpbase connect/i)
    assert.match(output.error.message, /SEO_SERPBASE_API_KEY/)
    assert.equal(result.stderr, '')
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('SerpBase disconnect leaves the environment credential explicit', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'serpbase', 'disconnect', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_SERPBASE_API_KEY: 'environment-secret',
      },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      savedCredentialRemoved: true,
      environmentCredential: 'active',
      note: 'The environment variable was not changed. Clear SEO_SERPBASE_API_KEY to fully disconnect.',
    })
    assert.doesNotMatch(result.stdout, /environment-secret/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('SerpBase limits persist integer micros and report ceilings', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-serpbase-cli-cache-'))
  try {
    const result = await runSeo(
      [
        'providers',
        'serpbase',
        'limits',
        '--daily-notice',
        '1.5',
        '--daily-limit',
        '5',
        '--requests',
        '12',
        '--rows',
        '500',
        '--json',
      ],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    assert.equal(result.exitCode, 0)
    const output = JSON.parse(result.stdout)
    assert.equal(output.provider, 'serpbase')
    assert.equal(output.limits.dailyNoticeMicros, 1_500_000)
    assert.equal(output.limits.dailyHardLimitMicros, 5_000_000)
    assert.equal(output.limits.maxRequestsPerReport, 12)
    assert.equal(output.limits.maxRowsPerReport, 500)
    const config = JSON.parse(
      await readFile(join(configDir, 'config.json'), 'utf8'),
    )
    assert.equal(
      config.providers.costLimits.serpbase.dailyNoticeMicros,
      1_500_000,
    )
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
