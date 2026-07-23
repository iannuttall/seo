import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import { configSchema, type StoredTokens } from '../types.js'
import { writeConfig, writeTokens } from './config.js'
import { setKeyringForTests } from './keyring.js'
import {
  MANAGED_PROVIDER_SECRET_NAMES,
  PROVIDER_SECRET_NAMES,
  writeProviderSecret,
} from './provider-secrets.js'
import { resetSeoData } from './reset.js'

class MemoryKeyring {
  readonly values = new Map<string, string>()
  readonly failedDeletes = new Set<string>()
  unavailable = false

  private key(service: string, account: string): string {
    return `${service}:${account}`
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    if (this.unavailable) throw new Error('Keychain unavailable')
    return this.values.get(this.key(service, account)) ?? null
  }

  async setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void> {
    if (this.unavailable) throw new Error('Keychain unavailable')
    this.values.set(this.key(service, account), password)
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    const key = this.key(service, account)
    if (this.unavailable || this.failedDeletes.has(key)) {
      throw new Error('Keychain deletion failed')
    }
    return this.values.delete(key)
  }
}

const root = mkdtempSync(join(tmpdir(), 'seo-reset-data-'))
const configDir = join(root, 'config')
const cacheDir = join(root, 'cache')
const logDir = join(root, 'logs')
const previousEnvironment = {
  config: process.env.SEO_CONFIG_DIR,
  cache: process.env.SEO_CACHE_DIR,
  log: process.env.SEO_LOG_DIR,
}
const keyring = new MemoryKeyring()

function tokens(): StoredTokens {
  return {
    provider: 'google',
    account_email: 'owner@example.com',
    scope: 'openid email',
    token_type: 'Bearer',
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: 1_900_000_000_000,
    obtained_at: 1_800_000_000_000,
    client_source: 'shared',
  }
}

function restoreEnvironment(): void {
  const values = [
    ['SEO_CONFIG_DIR', previousEnvironment.config],
    ['SEO_CACHE_DIR', previousEnvironment.cache],
    ['SEO_LOG_DIR', previousEnvironment.log],
  ] as const
  for (const [name, value] of values) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

async function seedStorage(useKeychain: boolean): Promise<void> {
  writeConfig(configSchema.parse({ security: { useKeychain } }))
  await writeTokens(tokens())
  for (const name of MANAGED_PROVIDER_SECRET_NAMES) {
    await writeProviderSecret(name, `${name}-value`)
  }
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(logDir, { recursive: true })
  writeFileSync(join(cacheDir, 'cache-marker'), 'cache')
  writeFileSync(join(logDir, 'log-marker'), 'log')
}

before(() => {
  process.env.SEO_CONFIG_DIR = configDir
  process.env.SEO_CACHE_DIR = cacheDir
  process.env.SEO_LOG_DIR = logDir
  setKeyringForTests(keyring)
})

beforeEach(() => {
  rmSync(configDir, { recursive: true, force: true })
  rmSync(cacheDir, { recursive: true, force: true })
  rmSync(logDir, { recursive: true, force: true })
  keyring.values.clear()
  keyring.failedDeletes.clear()
  keyring.unavailable = false
})

after(() => {
  rmSync(root, { recursive: true, force: true })
  restoreEnvironment()
  setKeyringForTests()
})

test('reset removes Google and provider keychain secrets before local files', async () => {
  await seedStorage(true)
  assert.equal(keyring.values.size, 5)

  await resetSeoData()

  assert.equal(keyring.values.size, 0)
  assert.equal(existsSync(configDir), false)
  assert.equal(existsSync(cacheDir), false)
  assert.equal(existsSync(logDir), false)
})

test('reset removes private file credentials when the keychain is unavailable', async () => {
  keyring.unavailable = true
  await seedStorage(false)
  const environment = {
    SEO_DATAFORSEO_LOGIN: 'login-from-environment',
    SEO_DATAFORSEO_PASSWORD: 'password-from-environment',
    SEO_BING_API_KEY: 'bing-from-environment',
    SEO_INDEXNOW_KEY: 'indexnow-from-environment',
  }
  const previous = Object.fromEntries(
    Object.keys(environment).map((name) => [name, process.env[name]]),
  )
  Object.assign(process.env, environment)

  try {
    await resetSeoData()

    assert.equal(existsSync(configDir), false)
    assert.equal(existsSync(cacheDir), false)
    assert.equal(existsSync(logDir), false)
    for (const [name, value] of Object.entries(environment)) {
      assert.equal(process.env[name], value)
    }
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('reset keeps local files when an active provider keychain secret cannot be removed', async () => {
  await seedStorage(true)
  const failedKey = `seo:provider:${PROVIDER_SECRET_NAMES.dataForSeoCredentials}`
  keyring.failedDeletes.add(failedKey)

  await assert.rejects(
    resetSeoData(),
    /stopped before deleting local files because saved credentials could not be removed/i,
  )

  assert.equal(keyring.values.get(failedKey), 'dataforseo-credentials-value')
  assert.equal(existsSync(getSeoCliPaths().configFile), true)
  assert.equal(existsSync(cacheDir), true)
  assert.equal(existsSync(logDir), true)

  keyring.failedDeletes.clear()
  await resetSeoData()
  assert.equal(keyring.values.size, 0)
  assert.equal(existsSync(configDir), false)
})

test('reset keeps local files when Google token keychain cleanup fails', async () => {
  await seedStorage(true)
  const failedKey = 'seo:google:owner@example.com:refresh'
  keyring.failedDeletes.add(failedKey)

  await assert.rejects(
    resetSeoData(),
    /stopped before deleting local files because saved credentials could not be removed/i,
  )

  assert.equal(keyring.values.get(failedKey), 'refresh-token')
  assert.equal(existsSync(getSeoCliPaths().tokensFile), true)
  assert.equal(existsSync(cacheDir), true)
  assert.equal(existsSync(logDir), true)

  keyring.failedDeletes.clear()
  await resetSeoData()
  assert.equal(keyring.values.size, 0)
  assert.equal(existsSync(configDir), false)
})
