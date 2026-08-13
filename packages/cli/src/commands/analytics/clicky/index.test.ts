import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../../../index.js', import.meta.url))

test('legacy Clicky projects use the extracted report action', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-clicky-command-'))
  const packageDir = join(
    configDir,
    'providers',
    'node_modules',
    '@example',
    'clicky',
  )
  try {
    await mkdir(join(packageDir, 'dist'), { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@example/clicky',
        version: '1.2.3',
        type: 'module',
        seo: { apiVersion: 1, providers: ['./dist/index.js'] },
      }),
    )
    await writeFile(
      join(packageDir, 'dist', 'index.js'),
      `export default host => host.registerProvider({ id: 'clicky', displayName: 'Clicky', description: 'Clicky fixture.', kinds: ['traffic-analytics'], connection: { fields: [{ id: 'siteId', label: 'Site ID', kind: 'account' }, { id: 'sitekey', label: 'Sitekey', kind: 'secret', envVar: 'SEO_CLICKY_SITEKEY' }], async verify() {} }, capabilities: [{ id: 'landing-page-visits', async run(input) { return { metric: 'landing-page-visits', rows: [], returnedRows: 0, retainedRowLimit: input.limit, retainedRowLimitReached: false, dataStatus: 'complete', qualityWarnings: [] } } }], actions: [{ id: 'report', description: 'Run a report.', inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, cacheTtlMs: 86400000, async run(input) { if (!input.credentials.sitekey) throw new Error('Missing sitekey.'); return { siteId: input.account.siteId, type: input.params.type, range: { startDate: input.params.startDate, endDate: input.params.endDate }, rows: [{ value: 7, title: 'Home', url: 'https://example.com/' }], returnedRows: 1, retainedRowLimit: input.params.limit, retainedRowLimitReached: false } } }] })`,
    )
    await writeFile(
      join(configDir, 'provider-packages.json'),
      JSON.stringify({
        schemaVersion: 1,
        packages: [
          {
            id: 'clicky',
            package: '@example/clicky',
            version: '1.2.3',
            integrity: 'sha512-YWJjZGVmZ2hpamts',
            enabled: true,
            installedAt: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    )
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        defaultSite: 'sc-domain:example.com',
        sites: [],
        clients: [
          {
            id: 'legacy',
            name: 'Legacy',
            siteUrl: 'sc-domain:example.com',
            watchUrls: [],
            brandTerms: [],
            analytics: {
              selected: 'clicky',
              clicky: { siteId: '123' },
            },
            isDefault: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        analytics: { google: { propertyMappings: [] } },
        providers: { prefer: 'cheap' },
        security: { useKeychain: false },
        auth: {},
      }),
    )
    await writeFile(
      join(configDir, 'provider-secrets.json'),
      JSON.stringify({
        version: 1,
        secrets: {
          'clicky-sitekeys': JSON.stringify({
            version: 1,
            siteKeys: { 123: 'abc123abc123' },
          }),
        },
      }),
      { mode: 0o600 },
    )
    const result = await execFileAsync(
      process.execPath,
      [
        cliPath,
        'analytics',
        'clicky',
        'report',
        '--project',
        'legacy',
        '--start-date',
        '2026-08-01',
        '--end-date',
        '2026-08-07',
        '--limit',
        '100',
        '--json',
      ],
      {
        env: {
          ...process.env,
          CI: '1',
          NO_UPDATE_NOTIFIER: '1',
          SEO_CONFIG_DIR: configDir,
          SEO_CACHE_DIR: join(configDir, 'cache'),
          SEO_CLICKY_SITEKEY: '',
        },
      },
    )
    assert.deepEqual(JSON.parse(result.stdout), {
      siteId: '123',
      type: 'pages-entrance',
      range: { startDate: '2026-08-01', endDate: '2026-08-07' },
      rows: [{ value: 7, title: 'Home', url: 'https://example.com/' }],
      returnedRows: 1,
      retainedRowLimit: 100,
      retainedRowLimitReached: false,
      cache: 'miss',
    })
    assert.equal(result.stderr, '')
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})
