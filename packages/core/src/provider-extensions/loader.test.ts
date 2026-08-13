import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import type { InstalledProviderPackage } from './contracts.js'
import { loadInstalledProviderExtensions } from './loader.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function fixturePackage(input: { registeredId: string }): {
  packagesDir: string
  installed: InstalledProviderPackage
} {
  const root = mkdtempSync(join(tmpdir(), 'seo-provider-loader-'))
  roots.push(root)
  const packagesDir = join(root, 'providers')
  const packageDir = join(packagesDir, 'node_modules', '@example', 'fixture')
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
    `export default function activate(host) { host.registerProvider({ id: ${JSON.stringify(input.registeredId)}, displayName: 'Fixture', description: 'Fixture analytics provider.', kinds: ['traffic-analytics'], connection: { fields: [{ id: 'account', label: 'Account', kind: 'account' }], async verify() {} }, capabilities: [{ id: 'landing-page-visits', async run() { return { metric: 'landing-page-visits', rows: [], returnedRows: 0, retainedRowLimit: 100, retainedRowLimitReached: false, dataStatus: 'complete', qualityWarnings: [] } } }] }) }`,
  )
  return {
    packagesDir,
    installed: {
      id: 'fixture',
      package: '@example/fixture',
      version: '1.2.3',
      integrity: 'sha512-YWJjZGVmZ2hpamts',
      enabled: true,
      installedAt: '2026-08-11T10:00:00.000Z',
    },
  }
}

test('provider loader imports only declared entry points', async () => {
  const fixture = fixturePackage({ registeredId: 'fixture' })
  const result = await loadInstalledProviderExtensions({
    packagesDir: fixture.packagesDir,
    installed: [fixture.installed],
  })

  assert.deepEqual(result.failures, [])
  const provider = result.registry.get('fixture')
  assert.deepEqual(
    provider && {
      id: provider.id,
      displayName: provider.displayName,
      description: provider.description,
      kinds: provider.kinds,
      capabilityIds: provider.capabilities.map((item) => item.id),
      package: provider.package,
      version: provider.version,
    },
    {
      id: 'fixture',
      displayName: 'Fixture',
      description: 'Fixture analytics provider.',
      kinds: ['traffic-analytics'],
      capabilityIds: ['landing-page-visits'],
      package: '@example/fixture',
      version: '1.2.3',
    },
  )
  const capability = result.registry.capability(
    'fixture',
    'landing-page-visits',
  )
  assert.equal(typeof capability?.run, 'function')
  const adapterResult = await capability?.run(
    {
      account: { account: 'one' },
      credentials: {},
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      limit: 100,
    },
    { requestJson: async () => [], now: () => '2026-08-01T00:00:00.000Z' },
  )
  assert.equal(adapterResult?.metric, 'landing-page-visits')
})

test('provider loader rejects packages that register another id', async () => {
  const fixture = fixturePackage({ registeredId: 'surprise' })
  const result = await loadInstalledProviderExtensions({
    packagesDir: fixture.packagesDir,
    installed: [fixture.installed],
  })

  assert.equal(result.failures.length, 1)
  assert.match(result.failures[0]?.message ?? '', /exactly fixture/i)
})
