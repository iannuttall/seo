import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import { configSchema } from '../types.js'
import { writeConfig } from './config.js'
import { setKeyringForTests } from './keyring.js'
import {
  deleteManagedProviderSecrets,
  deleteProviderSecret,
  MANAGED_PROVIDER_SECRET_NAMES,
  PROVIDER_SECRET_NAMES,
  readProviderSecret,
  writeProviderSecret,
} from './provider-secrets.js'

class MemoryKeyring {
  readonly values = new Map<string, string>()
  readonly failedDeletes = new Set<string>()
  unavailable = false

  async getPassword(service: string, account: string): Promise<string | null> {
    if (this.unavailable) throw new Error('Unavailable')
    return this.values.get(`${service}:${account}`) ?? null
  }

  async setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void> {
    if (this.unavailable) throw new Error('Unavailable')
    this.values.set(`${service}:${account}`, password)
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    if (this.unavailable) throw new Error('Unavailable')
    if (this.failedDeletes.has(`${service}:${account}`)) {
      throw new Error('Delete failed')
    }
    return this.values.delete(`${service}:${account}`)
  }
}

const configDir = mkdtempSync(join(tmpdir(), 'seo-provider-secrets-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const keyring = new MemoryKeyring()

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = configDir
  rmSync(configDir, { recursive: true, force: true })
  keyring.values.clear()
  keyring.failedDeletes.clear()
  keyring.unavailable = false
  setKeyringForTests(keyring)
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  setKeyringForTests()
})

test('provider secrets prefer the environment without persisting it', async () => {
  assert.deepEqual(
    await readProviderSecret({
      name: 'bing-api-key',
      envVar: 'SEO_BING_API_KEY',
      env: { SEO_BING_API_KEY: ' environment-key ' },
    }),
    { value: 'environment-key', source: 'environment' },
  )
  assert.equal(existsSync(getSeoCliPaths().providerSecretsFile), false)
})

test('provider secrets use the keychain when available', async () => {
  writeConfig(configSchema.parse({}))
  assert.equal(
    await writeProviderSecret(PROVIDER_SECRET_NAMES.bingApiKey, 'secret'),
    'keychain',
  )
  assert.deepEqual(
    await readProviderSecret({ name: PROVIDER_SECRET_NAMES.bingApiKey }),
    {
      value: 'secret',
      source: 'keychain',
    },
  )
  await deleteProviderSecret(PROVIDER_SECRET_NAMES.bingApiKey)
  assert.equal(
    await readProviderSecret({ name: PROVIDER_SECRET_NAMES.bingApiKey }),
    undefined,
  )
})

test('managed provider reset removes every keychain secret', async () => {
  writeConfig(configSchema.parse({}))
  for (const name of MANAGED_PROVIDER_SECRET_NAMES) {
    await writeProviderSecret(name, `${name}-value`)
  }

  await deleteManagedProviderSecrets()

  assert.equal(keyring.values.size, 0)
  assert.equal(existsSync(getSeoCliPaths().providerSecretsFile), false)
})

test('managed provider reset removes the private file fallback', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))
  for (const name of MANAGED_PROVIDER_SECRET_NAMES) {
    await writeProviderSecret(name, `${name}-value`)
  }
  assert.equal(existsSync(getSeoCliPaths().providerSecretsFile), true)

  await deleteManagedProviderSecrets()

  assert.equal(existsSync(getSeoCliPaths().providerSecretsFile), false)
})

test('managed provider reset reports keychain failures after trying every secret', async () => {
  writeConfig(configSchema.parse({}))
  for (const name of MANAGED_PROVIDER_SECRET_NAMES) {
    await writeProviderSecret(name, `${name}-value`)
  }
  const failedKey = `seo:provider:${PROVIDER_SECRET_NAMES.dataForSeoCredentials}`
  keyring.failedDeletes.add(failedKey)

  await assert.rejects(
    deleteManagedProviderSecrets(),
    /could not remove 1 saved provider credential record/i,
  )

  assert.equal(
    keyring.values.get(failedKey),
    `${PROVIDER_SECRET_NAMES.dataForSeoCredentials}-value`,
  )
  assert.equal(keyring.values.size, 1)
})

test('provider deletion does not claim success when its keychain write remains', async () => {
  writeConfig(configSchema.parse({}))
  await writeProviderSecret(PROVIDER_SECRET_NAMES.bingApiKey, 'secret')
  const failedKey = `seo:provider:${PROVIDER_SECRET_NAMES.bingApiKey}`
  keyring.failedDeletes.add(failedKey)

  await assert.rejects(
    deleteProviderSecret(PROVIDER_SECRET_NAMES.bingApiKey),
    /could not be removed from the system keychain/i,
  )
  assert.deepEqual(
    await readProviderSecret({ name: PROVIDER_SECRET_NAMES.bingApiKey }),
    {
      value: 'secret',
      source: 'keychain',
    },
  )
})

test('provider secrets fall back to a private file', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))
  assert.equal(
    await writeProviderSecret(PROVIDER_SECRET_NAMES.bingApiKey, 'secret'),
    'file',
  )
  const path = getSeoCliPaths().providerSecretsFile
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.deepEqual(
    await readProviderSecret({ name: PROVIDER_SECRET_NAMES.bingApiKey }),
    {
      value: 'secret',
      source: 'file',
    },
  )
})

test('provider secret reads repair permissive file permissions', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))
  await writeProviderSecret('bing-api-key', 'secret')
  const path = getSeoCliPaths().providerSecretsFile
  chmodSync(path, 0o644)

  assert.deepEqual(await readProviderSecret({ name: 'bing-api-key' }), {
    value: 'secret',
    source: 'file',
  })
  assert.equal(statSync(path).mode & 0o777, 0o600)
})

test('corrupt provider secret files fail clearly', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))
  const path = getSeoCliPaths().providerSecretsFile
  writeFileSync(path, '{not-json', { mode: 0o600 })

  await assert.rejects(
    readProviderSecret({ name: 'bing-api-key' }),
    /saved provider credentials are invalid/i,
  )
})
