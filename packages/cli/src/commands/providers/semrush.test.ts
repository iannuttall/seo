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

test('Semrush status uses the environment API key without exposing it', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-cache-'))
  try {
    const result = await runSeo(['providers', 'semrush', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_SEMRUSH_API_KEY: 'environment-api-key',
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      connected: true,
      apiVersion: 3,
      credentialSource: 'environment',
      migratedLegacyCredential: false,
      liveCheck: { status: 'not-requested' },
    })
    assert.doesNotMatch(result.stdout, /environment-api-key/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('Semrush status migrates a legacy config API key', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-cache-'))
  const configPath = join(configDir, 'config.json')
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        providers: {
          semrushApiKey: 'legacy-api-key',
          prefer: 'authoritative',
        },
        security: { useKeychain: false },
      }),
      { mode: 0o600 },
    )
    const result = await runSeo(['providers', 'semrush', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_SEMRUSH_API_KEY: '',
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      connected: true,
      apiVersion: 3,
      credentialSource: 'file',
      migratedLegacyCredential: true,
      liveCheck: { status: 'not-requested' },
    })

    const config = await readFile(configPath, 'utf8')
    assert.doesNotMatch(config, /legacy-api-key|semrushApiKey/)
    const secretsPath = join(configDir, 'provider-secrets.json')
    const secrets = await readFile(secretsPath, 'utf8')
    assert.match(secrets, /semrush-api-key/)
    assert.equal((await stat(secretsPath)).mode & 0o777, 0o600)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('Semrush connect refuses to prompt in JSON or CI mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-cache-'))
  try {
    const result = await runSeo(['providers', 'semrush', 'connect', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_SEMRUSH_API_KEY: '',
    })
    assert.notEqual(result.exitCode, 0)
    const output = JSON.parse(result.stdout) as {
      error: { code: string; message: string }
    }
    assert.equal(output.error.code, 'AUTH_REQUIRED')
    assert.match(output.error.message, /run `seo providers semrush connect`/i)
    assert.match(output.error.message, /SEO_SEMRUSH_API_KEY/)
    assert.equal(result.stderr, '')
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('Semrush disconnect leaves an environment API key explicit', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-semrush-cli-cache-'))
  try {
    const result = await runSeo(
      ['providers', 'semrush', 'disconnect', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
        SEO_SEMRUSH_API_KEY: 'environment-api-key',
      },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      savedCredentialRemoved: true,
      environmentCredential: 'active',
      note: 'The environment variable was not changed. Clear SEO_SEMRUSH_API_KEY to fully disconnect.',
    })
    assert.doesNotMatch(result.stdout, /environment-api-key/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
