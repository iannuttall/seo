import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { getSeoCliPaths } from '../../paths.js'
import { writeConfig } from '../../storage/config.js'
import { setKeyringForTests } from '../../storage/keyring.js'
import { configSchema } from '../../types.js'
import {
  AHREFS_API_KEY_ENV,
  AHREFS_API_KEY_SECRET,
  deleteAhrefsApiKey,
  readAhrefsApiKey,
  writeAhrefsApiKey,
} from './credentials.js'

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

const configDir = mkdtempSync(join(tmpdir(), 'seo-ahrefs-credentials-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousApiKey = process.env[AHREFS_API_KEY_ENV]
const keyring = new MemoryKeyring()

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = configDir
  delete process.env[AHREFS_API_KEY_ENV]
  rmSync(configDir, { recursive: true, force: true })
  keyring.values.clear()
  keyring.unavailable = false
  setKeyringForTests(keyring)
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  if (previousApiKey === undefined) delete process.env[AHREFS_API_KEY_ENV]
  else process.env[AHREFS_API_KEY_ENV] = previousApiKey
  setKeyringForTests()
})

test('environment API key takes precedence without being persisted', async () => {
  process.env[AHREFS_API_KEY_ENV] = ' environment-api-key '

  assert.deepEqual(await readAhrefsApiKey(), {
    apiKey: 'environment-api-key',
    source: 'environment',
  })
  assert.equal(existsSync(getSeoCliPaths().providerSecretsFile), false)
})

test('API key uses the system keychain', async () => {
  writeConfig(configSchema.parse({}))

  assert.equal(await writeAhrefsApiKey('saved-api-key'), 'keychain')
  assert.deepEqual(await readAhrefsApiKey(), {
    apiKey: 'saved-api-key',
    source: 'keychain',
  })
  assert.equal(
    keyring.values.get(`seo:provider:${AHREFS_API_KEY_SECRET}`),
    'saved-api-key',
  )
})

test('API key falls back to a private local file', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))

  assert.equal(await writeAhrefsApiKey('file-api-key'), 'file')
  assert.equal(
    statSync(getSeoCliPaths().providerSecretsFile).mode & 0o777,
    0o600,
  )
  assert.deepEqual(await readAhrefsApiKey(), {
    apiKey: 'file-api-key',
    source: 'file',
  })
})

test('disconnect removes the saved API key', async () => {
  writeConfig(configSchema.parse({}))
  await writeAhrefsApiKey('saved-api-key')

  await deleteAhrefsApiKey()

  assert.equal(await readAhrefsApiKey(), undefined)
})
