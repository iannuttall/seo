import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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

test('DataForSEO status uses environment credentials without exposing them', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'dataforseo', 'status', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_DATAFORSEO_LOGIN: 'api-owner@example.test',
        SEO_DATAFORSEO_PASSWORD: 'environment-password',
      },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      connected: true,
      credentialSource: 'environment',
      migratedLegacyCredentials: false,
      liveCheck: { status: 'not-requested' },
    })
    assert.doesNotMatch(result.stdout, /environment-password/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('DataForSEO status migrates legacy config into the private store', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-cache-'))
  const configPath = join(configDir, 'config.json')
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        providers: {
          dataForSeoLogin: 'legacy-owner@example.test',
          dataForSeoPassword: 'legacy-password',
          prefer: 'cheap',
        },
        security: { useKeychain: false },
      }),
      { mode: 0o600 },
    )
    const result = await runSeo(
      ['providers', 'dataforseo', 'status', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      connected: true,
      credentialSource: 'file',
      migratedLegacyCredentials: true,
      liveCheck: { status: 'not-requested' },
    })

    const config = await readFile(configPath, 'utf8')
    assert.doesNotMatch(config, /legacy-password|dataForSeoPassword/)
    const secretsPath = join(configDir, 'provider-secrets.json')
    const secrets = await readFile(secretsPath, 'utf8')
    assert.match(secrets, /dataforseo-credentials/)
    assert.equal((await stat(secretsPath)).mode & 0o777, 0o600)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('DataForSEO connect refuses to prompt in JSON or CI mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'dataforseo', 'connect', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    assert.notEqual(result.exitCode, 0)
    const output = JSON.parse(result.stdout) as {
      error: { code: string; message: string }
    }
    assert.equal(output.error.code, 'AUTH_REQUIRED')
    assert.match(
      output.error.message,
      /run `seo providers dataforseo connect`/i,
    )
    assert.match(output.error.message, /SEO_DATAFORSEO_LOGIN/)
    assert.doesNotMatch(result.stdout, /environment-password/)
    assert.equal(result.stderr, '')
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('DataForSEO disconnect leaves environment credentials explicit', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'dataforseo', 'disconnect', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_DATAFORSEO_LOGIN: 'api-owner@example.test',
        SEO_DATAFORSEO_PASSWORD: 'environment-password',
      },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      savedCredentialsRemoved: true,
      environmentCredentials: 'active',
      note: 'Environment variables were not changed. Clear SEO_DATAFORSEO_LOGIN and SEO_DATAFORSEO_PASSWORD to fully disconnect.',
    })
    assert.doesNotMatch(result.stdout, /environment-password/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('DataForSEO limits store integer micros and bounded report ceilings', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-cache-'))
  try {
    const result = await runSeo(
      [
        'providers',
        'dataforseo',
        'limits',
        '--daily-notice',
        '2.5',
        '--daily-limit',
        '10',
        '--monthly-limit',
        'off',
        '--requests',
        '8',
        '--rows',
        '4000',
        '--json',
      ],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_DATAFORSEO_LOGIN: '',
        SEO_DATAFORSEO_PASSWORD: '',
      },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      provider: 'dataforseo',
      changed: true,
      limits: {
        dailyNoticeMicros: 2_500_000,
        dailyHardLimitMicros: 10_000_000,
        monthlyHardLimitMicros: null,
        maxRequestsPerReport: 8,
        maxRowsPerReport: 4_000,
      },
    })
    const stored = JSON.parse(
      await readFile(join(configDir, 'config.json'), 'utf8'),
    )
    assert.equal(
      stored.providers.costLimits.dataforseo.dailyNoticeMicros,
      2_500_000,
    )

    const disabledNotice = await runSeo(
      ['providers', 'dataforseo', 'limits', '--daily-notice', 'off', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_DATAFORSEO_LOGIN: '',
        SEO_DATAFORSEO_PASSWORD: '',
      },
    )
    assert.equal(disabledNotice.exitCode, 0)
    assert.equal(JSON.parse(disabledNotice.stdout).limits.dailyNoticeMicros, 0)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('DataForSEO limits reject unsafe values before writing config', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'dataforseo', 'limits', '--rows', '0', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_DATAFORSEO_LOGIN: '',
        SEO_DATAFORSEO_PASSWORD: '',
      },
    )
    assert.notEqual(result.exitCode, 0)
    const output = JSON.parse(result.stdout) as {
      error: { code: string; message: string }
    }
    assert.equal(output.error.code, 'INVALID_INPUT')
    assert.match(output.error.message, /--rows must be an integer from 1/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('DataForSEO spend keeps local and account-wide states separate', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-dataforseo-cli-cache-'))
  const env = {
    SEO_CONFIG_DIR: configDir,
    SEO_CACHE_DIR: cacheDir,
    SEO_DATAFORSEO_LOGIN: '',
    SEO_DATAFORSEO_PASSWORD: '',
  }
  try {
    const localOnly = await runSeo(
      ['providers', 'dataforseo', 'spend', '--no-account', '--json'],
      env,
    )
    assert.equal(localOnly.exitCode, 0)
    const localOutput = JSON.parse(localOnly.stdout)
    assert.equal(localOutput.local.today.effectiveCostMicros, 0)
    assert.equal(localOutput.local.month.requests, 0)
    assert.equal(localOutput.local.periodTimezone, 'UTC')
    assert.deepEqual(localOutput.account, { status: 'not-requested' })

    const withAccount = await runSeo(
      ['providers', 'dataforseo', 'spend', '--json'],
      env,
    )
    assert.equal(withAccount.exitCode, 0)
    const accountOutput = JSON.parse(withAccount.stdout)
    assert.equal(accountOutput.account.status, 'unavailable')
    assert.match(accountOutput.account.reason, /not connected/i)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
