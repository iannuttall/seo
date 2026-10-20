import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url))

async function runSeoResult(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
      },
      maxBuffer: 1024 * 1024,
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

// biome-ignore format: Keep this large integration suite flat while Node runs bounded subtests concurrently.
describe('CLI help and integration contracts', { concurrency: 3 }, () => {
test('report JSON never prompts without a selector', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-report-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-report-cache-'))

  try {
    const result = await runSeoResult(['report', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.deepEqual(output, {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message:
          'No site given. Pass --site with a domain, URL or sc-domain: property. Run `seo sites` to list your Search Console properties.',
        retryable: false,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('start JSON does not silently skip missing authentication', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-cache-'))

  try {
    const result = await runSeoResult(['start', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 3)
    assert.equal(result.stderr, '')
    assert.deepEqual(output, {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message:
          'Not signed in. Run `seo start` or `seo auth login` in a terminal.',
        retryable: false,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('start dry-run does not create local data directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seo-start-dry-run-'))
  const configDir = join(root, 'config')
  const cacheDir = join(root, 'cache')
  const logDir = join(root, 'logs')

  try {
    const result = await runSeoResult(['start', '--dry-run', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_LOG_DIR: logDir,
    })

    assert.equal(result.exitCode, 0)
    assert.equal(JSON.parse(result.stdout).dryRun, true)
    await Promise.all(
      [configDir, cacheDir, logDir].map((path) => assert.rejects(access(path))),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reset refuses to prompt outside a terminal without --yes', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-reset-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-reset-cache-'))
  const marker = join(configDir, 'keep.txt')
  await writeFile(marker, 'example')

  try {
    const result = await runSeoResult(['reset'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })

    assert.equal(result.exitCode, 2)
    assert.match(
      `${result.stdout}${result.stderr}`,
      /Cannot prompt here\. Pass --yes to confirm reset\./,
    )
    await access(marker)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('auth status and interactive-only setup stay structured in JSON mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-auth-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-auth-cache-'))

  try {
    const status = await runSeoResult(['auth', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    assert.equal(status.exitCode, 0)
    const { sharedConfigured, accounts, ...statusJson } = JSON.parse(
      status.stdout,
    )
    assert.equal(typeof sharedConfigured, 'boolean')
    assert.deepEqual(accounts, [])
    assert.deepEqual(statusJson, {
      authenticated: false,
      mode: 'none',
      byoConfigured: false,
      serviceAccount: {
        configured: false,
      },
    })

    const setup = await runSeoResult(['auth', 'setup-client', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    assert.equal(setup.exitCode, 2)
    assert.equal(setup.stderr, '')
    assert.equal(JSON.parse(setup.stdout).error.code, 'INVALID_INPUT')
    assert.doesNotMatch(setup.stdout, /Google Desktop OAuth client ID|[◆◇]/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('auth storage reports and changes the local preference in JSON mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-auth-storage-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-auth-storage-cache-'))

  try {
    const defaultStorage = await runSeoResult(['auth', 'storage', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    assert.equal(defaultStorage.exitCode, 0)
    assert.deepEqual(JSON.parse(defaultStorage.stdout), {
      configured: 'keychain',
      active: 'keychain',
    })

    const fileStorage = await runSeoResult(
      ['auth', 'storage', '--file', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
      },
    )
    assert.equal(fileStorage.exitCode, 0)
    assert.deepEqual(JSON.parse(fileStorage.stdout), {
      configured: 'file',
      active: 'file',
    })

    const conflict = await runSeoResult(
      ['auth', 'storage', '--keychain', '--file', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
      },
    )
    assert.equal(conflict.exitCode, 2)
    assert.equal(JSON.parse(conflict.stdout).error.code, 'INVALID_INPUT')
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('auth status reports a service account identity without printing the key', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-service-account-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-service-account-cache-'))
  const privateKey = 'not-a-real-private-key'

  try {
    await writeFile(
      join(configDir, 'tokens.json'),
      JSON.stringify({
        provider: 'google',
        account_email: 'stored-account@example.com',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        token_type: 'Bearer',
        access_token: 'stored-access-token',
        refresh_token: 'stored-refresh-token',
        expires_at: Date.now() + 3_600_000,
        obtained_at: Date.now(),
        client_source: 'byo',
      }),
    )
    const status = await runSeoResult(['auth', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: 'service_account',
        client_email: 'seo-ci@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    })
    assert.equal(status.exitCode, 0)
    const { sharedConfigured, accounts, ...statusJson } = JSON.parse(
      status.stdout,
    )
    assert.equal(typeof sharedConfigured, 'boolean')
    assert.equal(accounts.length, 1)
    assert.equal(accounts[0].accountEmail, 'stored-account@example.com')
    assert.deepEqual(statusJson, {
      authenticated: true,
      mode: 'service-account',
      identity: 'seo-ci@example.iam.gserviceaccount.com',
      byoConfigured: false,
      serviceAccount: {
        configured: true,
        identity: 'seo-ci@example.iam.gserviceaccount.com',
        source: 'environment-json',
      },
    })
    assert.doesNotMatch(status.stdout, new RegExp(privateKey))

    const whoami = await runSeoResult(['auth', 'whoami'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: 'service_account',
        client_email: 'seo-ci@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    })
    assert.equal(whoami.exitCode, 0)
    assert.match(whoami.stdout, /seo-ci@example\.iam\.gserviceaccount\.com/)
    assert.doesNotMatch(whoami.stdout, new RegExp(privateKey))
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('report JSON fails clearly when Google auth is missing', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-cli-cache-'))

  try {
    const result = await runSeoResult(
      ['report', '--site', 'sc-domain:example.com', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 3)
    assert.equal(result.stderr, '')
    assert.deepEqual(output, {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Not signed in. Run `seo login` to use your seoskill.dev account on this machine (it prints a link to approve), or `seo auth login` to sign in with Google on this machine only. `seo crawl --url <url>` works without sign-in.',
        retryable: false,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

})
