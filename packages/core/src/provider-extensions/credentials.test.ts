import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { writeClickySiteKey } from '../clicky/credentials.js'
import { writeConfig } from '../storage/config.js'
import { configSchema } from '../types.js'
import {
  deleteProviderExtensionCredentials,
  readProviderExtensionCredentials,
  writeProviderExtensionCredentials,
} from './credentials.js'

const configDir = mkdtempSync(join(tmpdir(), 'seo-extension-credentials-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const fields = [
  {
    id: 'api-key',
    label: 'API key',
    kind: 'secret' as const,
    required: true,
    envVar: 'FIXTURE_API_KEY',
  },
]

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = configDir
  rmSync(configDir, { recursive: true, force: true })
  const config = configSchema.parse({})
  config.security.useKeychain = false
  writeConfig(config)
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
})

test('extension credentials stay separate for each provider account', async () => {
  await writeProviderExtensionCredentials({
    providerId: 'fixture',
    account: { site: 'one' },
    credentials: { 'api-key': 'secret-one' },
  })
  await writeProviderExtensionCredentials({
    providerId: 'fixture',
    account: { site: 'two' },
    credentials: { 'api-key': 'secret-two' },
  })

  assert.deepEqual(
    await readProviderExtensionCredentials({
      providerId: 'fixture',
      account: { site: 'one' },
      fields,
      env: {},
    }),
    { 'api-key': 'secret-one' },
  )
  assert.deepEqual(
    await readProviderExtensionCredentials({
      providerId: 'fixture',
      account: { site: 'two' },
      fields,
      env: { FIXTURE_API_KEY: 'environment-key' },
    }),
    { 'api-key': 'environment-key' },
  )

  await deleteProviderExtensionCredentials({
    providerId: 'fixture',
    account: { site: 'one' },
  })
  await assert.rejects(
    readProviderExtensionCredentials({
      providerId: 'fixture',
      account: { site: 'one' },
      fields,
      env: {},
    }),
    /API key is not set/i,
  )
})

test('Clicky provider reads the existing saved sitekey', async () => {
  await writeClickySiteKey('123', 'testtesttest')

  assert.deepEqual(
    await readProviderExtensionCredentials({
      providerId: 'clicky',
      account: { siteId: '123' },
      fields: [
        {
          id: 'sitekey',
          label: 'Sitekey',
          kind: 'secret',
          required: true,
          envVar: 'SEO_CLICKY_SITEKEY',
        },
      ],
      env: {},
    }),
    { sitekey: 'testtesttest' },
  )
})
