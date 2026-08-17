import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url))

async function runSeo(
  args: string[],
  env: Record<string, string>,
): Promise<string> {
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
  return `${result.stdout}${result.stderr}`
}

async function runSeoResult(
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

test('start never reuses a project only because the selected property matches', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-profile-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-profile-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }

  try {
    const added = await runSeoResult(
      [
        'projects',
        'add',
        '--id',
        'example',
        '--name',
        'example.com',
        '--site',
        'sc-domain:example.com',
        '--url',
        'https://example.com/',
        '--json',
      ],
      env,
    )
    assert.equal(added.exitCode, 0)

    const result = await runSeoResult(
      [
        'start',
        '--site',
        'sc-domain:example.com',
        '--skip-auth',
        '--skip-mcp',
        '--json',
      ],
      env,
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 0)
    assert.equal(output.client.id, 'example-com')
    assert.deepEqual(output.next, [
      'seo report --project example-com',
      'seo refresh-priorities --project example-com --verify-content',
      'seo technical-watch --project example-com',
    ])

    const listed = await runSeoResult(['projects', 'list', '--json'], env)
    assert.equal(listed.exitCode, 0)
    const clients = JSON.parse(listed.stdout).clients
    assert.equal(clients.length, 2)
    assert.equal(
      clients.find((client: { id: string }) => client.id === 'example')?.name,
      'example.com',
    )
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('start updates only an explicitly selected existing project', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-update-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-update-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }

  try {
    const added = await runSeoResult(
      [
        'projects',
        'add',
        '--id',
        'example',
        '--name',
        'Original name',
        '--site',
        'sc-domain:example.com',
        '--url',
        'https://example.com/original',
        '--urls',
        'https://example.com/watch',
        '--brand',
        'example',
        '--google-analytics-property',
        '123',
        '--json',
      ],
      env,
    )
    assert.equal(added.exitCode, 0)

    const result = await runSeoResult(
      [
        'start',
        '--id',
        'example',
        '--name',
        'Updated name',
        '--skip-auth',
        '--skip-mcp',
        '--json',
      ],
      env,
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 0)
    assert.equal(output.client.id, 'example')
    assert.equal(output.client.name, 'Updated name')
    assert.equal(output.client.siteUrl, 'sc-domain:example.com')
    assert.equal(output.client.startUrl, 'https://example.com/original')
    assert.deepEqual(output.client.watchUrls, ['https://example.com/watch'])
    assert.deepEqual(output.client.brandTerms, ['example'])
    assert.deepEqual(output.client.analytics, {
      selected: 'google',
      google: { propertyId: '123' },
    })

    const listed = await runSeoResult(['projects', 'list', '--json'], env)
    assert.equal(JSON.parse(listed.stdout).clients.length, 1)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('a new project never inherits the saved default Search Console property', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-default-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-default-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }

  try {
    await runSeo(
      [
        'projects',
        'add',
        '--id',
        'existing',
        '--site',
        'sc-domain:existing.example',
        '--default',
        '--json',
      ],
      env,
    )

    const result = await runSeoResult(
      ['start', '--id', 'new-project', '--skip-auth', '--skip-mcp', '--json'],
      env,
    )
    assert.equal(result.exitCode, 2)
    assert.equal(JSON.parse(result.stdout).error.code, 'INVALID_INPUT')

    const listed = JSON.parse(
      await runSeo(['projects', 'list', '--json'], env),
    ).clients
    assert.deepEqual(
      listed.map((client: { id: string }) => client.id),
      ['existing'],
    )
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('start saves separate Google accounts for Search Console and Analytics', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-accounts-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-accounts-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }
  const token = (accountEmail: string) => ({
    provider: 'google',
    account_email: accountEmail,
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
    ].join(' '),
    token_type: 'Bearer',
    access_token: `${accountEmail}-access`,
    refresh_token: `${accountEmail}-refresh`,
    expires_at: Date.now() + 3_600_000,
    obtained_at: Date.now(),
    client_source: 'shared',
  })

  try {
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ security: { useKeychain: false } }),
    )
    await writeFile(
      join(configDir, 'tokens.json'),
      JSON.stringify({
        version: 2,
        active_account: 'search@example.com',
        accounts: [token('search@example.com'), token('analytics@example.com')],
      }),
    )

    const result = await runSeoResult(
      [
        'start',
        '--id',
        'example',
        '--name',
        'Example',
        '--site',
        'sc-domain:example.com',
        '--search-console-account',
        'search@example.com',
        '--google-analytics-property',
        '123',
        '--google-analytics-account',
        'analytics@example.com',
        '--skip-mcp',
        '--skip-skill',
        '--json',
      ],
      env,
    )

    assert.equal(result.exitCode, 0, result.stderr)
    const client = JSON.parse(result.stdout).client
    assert.deepEqual(client.googleAccounts, {
      searchConsole: 'search@example.com',
      googleAnalytics: 'analytics@example.com',
    })
    assert.deepEqual(client.analytics.google, {
      propertyId: '123',
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('projects add attaches Clicky without clearing existing project fields', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-project-update-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-project-update-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }

  try {
    await runSeo(
      [
        'projects',
        'add',
        '--id',
        'example',
        '--name',
        'Example',
        '--site',
        'sc-domain:example.com',
        '--url',
        'https://example.com/',
        '--urls',
        'https://example.com/watch',
        '--brand',
        'example',
        '--google-analytics-property',
        '123',
        '--json',
      ],
      env,
    )

    const updated = JSON.parse(
      await runSeo(
        [
          'projects',
          'add',
          '--id',
          'example',
          '--clicky-site-id',
          '456',
          '--json',
        ],
        env,
      ),
    )

    assert.equal(updated.siteUrl, 'sc-domain:example.com')
    assert.equal(updated.startUrl, 'https://example.com/')
    assert.deepEqual(updated.watchUrls, ['https://example.com/watch'])
    assert.deepEqual(updated.brandTerms, ['example'])
    assert.deepEqual(updated.analytics, {
      selected: 'clicky',
      google: { propertyId: '123' },
      clicky: { siteId: '456' },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
