import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import { runAnalyticsProviderLandingPages } from './analytics.js'
import { saveInstalledProviderPackage } from './store.js'

const root = mkdtempSync(join(tmpdir(), 'seo-analytics-extension-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousCacheDir = process.env.SEO_CACHE_DIR

before(() => {
  process.env.SEO_CONFIG_DIR = join(root, 'config')
  process.env.SEO_CACHE_DIR = join(root, 'cache')
  const packageDir = join(
    getSeoCliPaths().providerPackagesDir,
    'node_modules',
    '@example',
    'fixture',
  )
  mkdirSync(join(packageDir, 'dist'), { recursive: true })
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@example/fixture',
      version: '1.2.3',
      type: 'module',
      seo: { apiVersion: 1, providers: ['./dist/index.js'] },
    }),
  )
  writeFileSync(
    join(packageDir, 'dist', 'index.js'),
    `export default host => host.registerProvider({ id: 'fixture', displayName: 'Fixture', description: 'Fixture analytics provider.', kinds: ['traffic-analytics'], connection: { fields: [{ id: 'siteId', label: 'Site ID', kind: 'account' }, { id: 'apiKey', label: 'API key', kind: 'secret' }], async verify() {} }, capabilities: [{ id: 'landing-page-visits', async run(input) { if (input.account.siteId === 'throw') throw new Error('Rejected ' + input.credentials.apiKey); return { metric: 'landing-page-visits', rows: [{ path: '/pricing', visits: 7 }], returnedRows: 1, retainedRowLimit: input.limit, retainedRowLimitReached: false, dataStatus: 'complete', qualityWarnings: [] } } }] })`,
  )
  saveInstalledProviderPackage({
    id: 'fixture',
    package: '@example/fixture',
    version: '1.2.3',
    integrity: 'sha512-YWJjZGVmZ2hpamts',
    enabled: true,
    installedAt: '2026-08-12T12:00:00.000Z',
  })
})

after(() => {
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  if (previousCacheDir === undefined) delete process.env.SEO_CACHE_DIR
  else process.env.SEO_CACHE_DIR = previousCacheDir
  rmSync(root, { recursive: true, force: true })
})

test('an installed package can return normalized report evidence', async () => {
  const result = await runAnalyticsProviderLandingPages({
    providerId: 'fixture',
    account: { siteId: 'one' },
    credentials: { apiKey: 'fixture-secret' },
    startDate: '2026-08-01',
    endDate: '2026-08-07',
    limit: 100,
    refresh: true,
  })

  assert.deepEqual(result.rows, [{ path: '/pricing', visits: 7 }])
  assert.equal(result.dataStatus, 'complete')
})

test('adapter errors cannot expose a supplied credential', async () => {
  await assert.rejects(
    runAnalyticsProviderLandingPages({
      providerId: 'fixture',
      account: { siteId: 'throw' },
      credentials: { apiKey: 'fixture-secret' },
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      limit: 100,
      refresh: true,
    }),
    (error: Error) => {
      assert.doesNotMatch(error.message, /fixture-secret/u)
      assert.match(error.message, /\[redacted\]/u)
      return true
    },
  )
})
