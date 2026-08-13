import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
      env: { ...process.env, ...env, CI: '1', NO_UPDATE_NOTIFIER: '1' },
      timeout: 10_000,
    })
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: result.code ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  }
}

test('provider extension inventory is deterministic in JSON mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-provider-list-'))
  try {
    const result = await runSeo(['providers', 'list', '--json'], {
      SEO_CONFIG_DIR: configDir,
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      schemaVersion: 1,
      installed: [],
    })
    assert.equal(result.stderr, '')
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test('provider install accepts only npm package names and exact versions', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-provider-install-'))
  try {
    const result = await runSeo(
      ['providers', 'install', 'github:example/provider', '--yes', '--json'],
      { SEO_CONFIG_DIR: configDir },
    )
    assert.notEqual(result.exitCode, 0)
    const output = JSON.parse(result.stdout) as {
      error: { code: string; message: string }
    }
    assert.equal(output.error.code, 'INVALID_INPUT')
    assert.match(output.error.message, /npm package name/i)
    assert.equal(result.stderr, '')
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test('one shared command connects any installed provider capability', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-provider-connect-'))
  const packageDir = join(
    configDir,
    'providers',
    'node_modules',
    '@example',
    'fixture',
  )
  try {
    await mkdir(join(packageDir, 'dist'), { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@example/fixture',
        version: '1.2.3',
        type: 'module',
        seo: { apiVersion: 1, providers: ['./dist/index.js'] },
      }),
    )
    await writeFile(
      join(packageDir, 'dist', 'index.js'),
      `export default host => host.registerProvider({ id: 'fixture', displayName: 'Fixture', description: 'Fixture provider.', kinds: ['traffic-analytics'], connection: { fields: [{ id: 'siteId', label: 'Site ID', kind: 'account' }, { id: 'apiKey', label: 'API key', kind: 'secret', envVar: 'SEO_FIXTURE_KEY' }], async verify() {} }, capabilities: [{ id: 'landing-page-visits', async run(input) { return { metric: 'landing-page-visits', rows: [], returnedRows: 0, retainedRowLimit: input.limit, retainedRowLimitReached: false, dataStatus: 'complete', qualityWarnings: [] } } }] })`,
    )
    await writeFile(
      join(configDir, 'provider-packages.json'),
      JSON.stringify({
        schemaVersion: 1,
        packages: [
          {
            id: 'fixture',
            package: '@example/fixture',
            version: '1.2.3',
            integrity: 'sha512-YWJjZGVmZ2hpamts',
            enabled: true,
            installedAt: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    )
    const env = {
      SEO_CONFIG_DIR: configDir,
      SEO_FIXTURE_KEY: 'fixture-secret',
    }
    const connected = await runSeo(
      [
        'providers',
        'connect',
        'fixture',
        '--account',
        '{"siteId":"123"}',
        '--json',
      ],
      env,
    )
    assert.equal(connected.exitCode, 0)
    assert.deepEqual(JSON.parse(connected.stdout), {
      provider: 'fixture',
      connected: true,
      account: { siteId: '123' },
      capabilities: ['landing-page-visits'],
      actions: [],
    })

    const status = await runSeo(
      ['providers', 'status', 'fixture', '--check', '--json'],
      env,
    )
    assert.equal(status.exitCode, 0)
    assert.equal(JSON.parse(status.stdout).check, 'passed')

    const disconnected = await runSeo(
      ['providers', 'disconnect', 'fixture', '--json'],
      env,
    )
    assert.equal(disconnected.exitCode, 0)
    assert.equal(JSON.parse(disconnected.stdout).disconnected, true)
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test('agents can describe and run an action-only provider', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-provider-action-'))
  const packageDir = join(
    configDir,
    'providers',
    'node_modules',
    '@example',
    'fixture',
  )
  try {
    await mkdir(join(packageDir, 'dist'), { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@example/fixture',
        version: '1.2.3',
        type: 'module',
        seo: { apiVersion: 1, providers: ['./dist/index.js'] },
      }),
    )
    await writeFile(
      join(packageDir, 'dist', 'index.js'),
      `export default host => host.registerProvider({ id: 'fixture', displayName: 'Fixture', description: 'Fixture provider.', kinds: ['other'], connection: { fields: [{ id: 'siteId', label: 'Site ID', kind: 'account' }, { id: 'apiKey', label: 'API key', kind: 'secret', envVar: 'SEO_FIXTURE_KEY' }], async verify() {} }, capabilities: [], actions: [{ id: 'report', description: 'Run a report.', inputSchema: { type: 'object', properties: { filters: { type: 'object' } } }, outputSchema: { type: 'object' }, async run(input) { return { siteId: input.account.siteId, filters: input.params.filters, secretWasPresent: Boolean(input.credentials.apiKey) } } }] })`,
    )
    await writeFile(
      join(configDir, 'provider-packages.json'),
      JSON.stringify({
        schemaVersion: 1,
        packages: [
          {
            id: 'fixture',
            package: '@example/fixture',
            version: '1.2.3',
            integrity: 'sha512-YWJjZGVmZ2hpamts',
            enabled: true,
            installedAt: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    )
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        sites: [],
        clients: [],
        analytics: { google: { propertyMappings: [] } },
        providers: {
          prefer: 'cheap',
          connections: { fixture: { siteId: '123' } },
        },
        security: { useKeychain: false },
        auth: {},
      }),
    )
    const described = await runSeo(
      ['providers', 'describe', 'fixture', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_FIXTURE_KEY: 'fixture-secret' },
    )
    assert.equal(described.exitCode, 0)
    assert.deepEqual(JSON.parse(described.stdout).actions, [
      {
        id: 'report',
        description: 'Run a report.',
        inputSchema: {
          type: 'object',
          properties: { filters: { type: 'object' } },
        },
        outputSchema: { type: 'object' },
        cacheTtlMs: 0,
      },
    ])

    const result = await runSeo(
      [
        'providers',
        'run',
        'fixture',
        'report',
        '--params',
        '{"filters":{"country":"GB","devices":["mobile"]}}',
        '--json',
      ],
      { SEO_CONFIG_DIR: configDir, SEO_FIXTURE_KEY: 'fixture-secret' },
    )
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      provider: 'fixture',
      action: 'report',
      cache: 'disabled',
      data: {
        siteId: '123',
        filters: { country: 'GB', devices: ['mobile'] },
        secretWasPresent: true,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})
