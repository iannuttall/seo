import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { getSeoCliPaths } from '../../paths.js'
import { readConfig, writeConfig } from '../../storage/config.js'
import { setKeyringForTests } from '../../storage/keyring.js'
import { writeProviderSecret } from '../../storage/provider-secrets.js'
import { configSchema } from '../../types.js'
import {
  deleteSemrushApiKey,
  readSemrushApiKey,
  SEMRUSH_API_KEY_ENV,
  SEMRUSH_API_KEY_SECRET,
  writeSemrushApiKey,
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

const configDir = mkdtempSync(join(tmpdir(), 'seo-semrush-credentials-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousApiKey = process.env[SEMRUSH_API_KEY_ENV]
const keyring = new MemoryKeyring()

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = configDir
  delete process.env[SEMRUSH_API_KEY_ENV]
  rmSync(configDir, { recursive: true, force: true })
  keyring.values.clear()
  keyring.unavailable = false
  setKeyringForTests(keyring)
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  if (previousApiKey === undefined) delete process.env[SEMRUSH_API_KEY_ENV]
  else process.env[SEMRUSH_API_KEY_ENV] = previousApiKey
  setKeyringForTests()
})

test('environment API key takes precedence without being persisted', async () => {
  process.env[SEMRUSH_API_KEY_ENV] = ' environment-api-key '

  assert.deepEqual(await readSemrushApiKey(), {
    apiKey: 'environment-api-key',
    source: 'environment',
    migrated: false,
  })
  assert.equal(existsSync(getSeoCliPaths().providerSecretsFile), false)
})

test('API key uses the system keychain', async () => {
  writeConfig(configSchema.parse({}))

  assert.equal(await writeSemrushApiKey('saved-api-key'), 'keychain')
  assert.deepEqual(await readSemrushApiKey(), {
    apiKey: 'saved-api-key',
    source: 'keychain',
    migrated: false,
  })
  assert.equal(
    keyring.values.get(`seo:provider:${SEMRUSH_API_KEY_SECRET}`),
    'saved-api-key',
  )
})

test('API key falls back to a private local file', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))

  assert.equal(await writeSemrushApiKey('file-api-key'), 'file')
  const path = getSeoCliPaths().providerSecretsFile
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.deepEqual(await readSemrushApiKey(), {
    apiKey: 'file-api-key',
    source: 'file',
    migrated: false,
  })
})

test('legacy config API key migrates only after secure storage succeeds', async () => {
  writeConfig(
    configSchema.parse({
      providers: {
        semrushApiKey: 'legacy-api-key',
        prefer: 'authoritative',
      },
    }),
  )

  assert.deepEqual(await readSemrushApiKey(), {
    apiKey: 'legacy-api-key',
    source: 'keychain',
    migrated: true,
  })
  assert.equal(readConfig().providers.semrushApiKey, undefined)
  assert.doesNotMatch(
    readFileSync(getSeoCliPaths().configFile, 'utf8'),
    /legacy-api-key/,
  )
})

test('temporary versioned credential migrates to the single Version 3 key', async () => {
  writeConfig(
    configSchema.parse({
      security: { useKeychain: false },
    }),
  )
  await writeProviderSecret(
    SEMRUSH_API_KEY_SECRET,
    JSON.stringify({
      schemaVersion: 1,
      apiKeys: {
        v3: 'version-3-api-key',
      },
    }),
  )

  assert.deepEqual(await readSemrushApiKey(), {
    apiKey: 'version-3-api-key',
    source: 'file',
    migrated: true,
  })
  assert.equal(
    JSON.parse(readFileSync(getSeoCliPaths().providerSecretsFile, 'utf8'))
      .secrets[SEMRUSH_API_KEY_SECRET],
    'version-3-api-key',
  )
})

test('disconnect removes saved and legacy API keys', async () => {
  writeConfig(
    configSchema.parse({
      providers: { semrushApiKey: 'legacy-api-key' },
    }),
  )
  await writeSemrushApiKey('saved-api-key')

  await deleteSemrushApiKey()

  assert.equal(await readSemrushApiKey(), undefined)
  assert.equal(readConfig().providers.semrushApiKey, undefined)
})
