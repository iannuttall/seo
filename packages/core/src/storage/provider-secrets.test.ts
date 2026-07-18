import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import { configSchema } from '../types.js'
import { writeConfig } from './config.js'
import { setKeyringForTests } from './keyring.js'
import {
  deleteProviderSecret,
  readProviderSecret,
  writeProviderSecret,
} from './provider-secrets.js'

class MemoryKeyring {
  readonly values = new Map<string, string>()
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
  assert.equal(await writeProviderSecret('bing-api-key', 'secret'), 'keychain')
  assert.deepEqual(await readProviderSecret({ name: 'bing-api-key' }), {
    value: 'secret',
    source: 'keychain',
  })
  await deleteProviderSecret('bing-api-key')
  assert.equal(await readProviderSecret({ name: 'bing-api-key' }), undefined)
})

test('provider secrets fall back to a private file', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))
  assert.equal(await writeProviderSecret('bing-api-key', 'secret'), 'file')
  const path = getSeoCliPaths().providerSecretsFile
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.deepEqual(await readProviderSecret({ name: 'bing-api-key' }), {
    value: 'secret',
    source: 'file',
  })
})
