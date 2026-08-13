import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import {
  readInstalledProviderPackages,
  removeInstalledProviderPackage,
  saveInstalledProviderPackage,
} from './store.js'

const root = mkdtempSync(join(tmpdir(), 'seo-provider-store-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = root
  rmSync(root, { recursive: true, force: true })
})

after(() => {
  rmSync(root, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
})

test('installed provider records are private, bounded, and sorted', () => {
  saveInstalledProviderPackage({
    id: 'zulu',
    package: '@example/zulu',
    version: '1.0.0',
    integrity: 'sha512-YWJjZGVmZ2hpamts',
    enabled: true,
    installedAt: '2026-08-11T10:00:00.000Z',
  })
  saveInstalledProviderPackage({
    id: 'alpha',
    package: '@example/alpha',
    version: '2.0.0',
    integrity: 'sha512-ZGVmZ2hpamtsbW5v',
    enabled: true,
    installedAt: '2026-08-11T11:00:00.000Z',
  })

  assert.deepEqual(
    readInstalledProviderPackages().packages.map((provider) => provider.id),
    ['alpha', 'zulu'],
  )
  assert.equal(
    statSync(join(root, 'provider-packages.json')).mode & 0o777,
    0o600,
  )
  assert.equal(removeInstalledProviderPackage('alpha')?.id, 'alpha')
  assert.deepEqual(
    readInstalledProviderPackages().packages.map((provider) => provider.id),
    ['zulu'],
  )
})
