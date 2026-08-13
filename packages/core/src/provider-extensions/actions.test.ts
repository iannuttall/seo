import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import { runProviderExtensionAction } from './actions.js'
import { saveInstalledProviderPackage } from './store.js'

const root = mkdtempSync(join(tmpdir(), 'seo-provider-action-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousCacheDir = process.env.SEO_CACHE_DIR

before(() => {
  process.env.SEO_CONFIG_DIR = join(root, 'config')
  process.env.SEO_CACHE_DIR = join(root, 'cache')
  const packageDir = join(
    getSeoCliPaths().providerPackagesDir,
    'node_modules',
    '@example',
    'fixture-action',
  )
  mkdirSync(join(packageDir, 'dist'), { recursive: true })
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@example/fixture-action',
      version: '1.2.3',
      type: 'module',
      seo: { apiVersion: 1, providers: ['./dist/index.js'] },
    }),
  )
  writeFileSync(
    join(packageDir, 'dist', 'index.js'),
    `export default host => host.registerProvider({ id: 'fixture-action', displayName: 'Fixture action', description: 'Fixture action provider.', kinds: ['other'], connection: { fields: [{ id: 'apiKey', label: 'API key', kind: 'secret', required: false }], async verify() {} }, capabilities: [], actions: [{ id: 'inspect', description: 'Inspect one domain.', inputSchema: { type: 'object', additionalProperties: false, properties: { domain: { type: 'string', minLength: 1 } }, required: ['domain'] }, outputSchema: { type: 'object', additionalProperties: false, properties: { rows: { type: 'array', items: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } } }, required: ['rows'] }, async run(input) { return input.params.domain === 'bad.example' ? { rows: 'invalid' } : { rows: [{ domain: input.params.domain }] } } }] })`,
  )
  saveInstalledProviderPackage({
    id: 'fixture-action',
    package: '@example/fixture-action',
    version: '1.2.3',
    integrity: 'sha512-YWJjZGVmZ2hpamts',
    enabled: true,
    installedAt: '2026-08-13T00:00:00.000Z',
  })
})

after(() => {
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  if (previousCacheDir === undefined) delete process.env.SEO_CACHE_DIR
  else process.env.SEO_CACHE_DIR = previousCacheDir
  rmSync(root, { recursive: true, force: true })
})

test('provider actions validate input and output against their schemas', async () => {
  await assert.rejects(
    runProviderExtensionAction({
      providerId: 'fixture-action',
      actionId: 'inspect',
      account: {},
      credentials: { apiKey: 'fixture-secret' },
      params: {},
    }),
    /input does not match its JSON schema/u,
  )

  await assert.rejects(
    runProviderExtensionAction({
      providerId: 'fixture-action',
      actionId: 'inspect',
      account: {},
      credentials: { apiKey: 'fixture-secret' },
      params: { domain: 'bad.example' },
    }),
    /output does not match its JSON schema/u,
  )

  const result = await runProviderExtensionAction({
    providerId: 'fixture-action',
    actionId: 'inspect',
    account: {},
    credentials: { apiKey: 'fixture-secret' },
    params: { domain: 'example.com' },
  })
  assert.deepEqual(result.data, { rows: [{ domain: 'example.com' }] })
})
