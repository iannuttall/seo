import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import {
  DEFAULT_PROVIDER_SPEND_LIMITS,
  getProviderSpendLimits,
  setProviderSpendLimits,
} from '../providers/cost-limits.js'
import { configSchema, type StoredTokens } from '../types.js'
import {
  deleteTokens,
  getTokenStorageStatus,
  readConfig,
  readTokens,
  setTokenStorageMode,
  writeConfig,
  writeTokens,
} from './config.js'
import { setKeyringForTests } from './keyring.js'

let configDir: string
let previousConfigDir: string | undefined

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
    if (this.unavailable) throw new Error('Keychain unavailable')
    if (this.failedDeletes.has(this.key(service, account))) {
      throw new Error('Keychain deletion failed')
    }
    return this.values.delete(this.key(service, account))
  }
}

const keyring = new MemoryKeyring()

function mode(path: string): number {
  return statSync(path).mode & 0o777
}

function testTokens(): StoredTokens {
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

function resetStorage(): void {
  rmSync(configDir, { recursive: true, force: true })
  mkdirSync(configDir, { recursive: true })
  keyring.values.clear()
  keyring.failedDeletes.clear()
  keyring.unavailable = false
}

before(() => {
  previousConfigDir = process.env.SEO_CONFIG_DIR
  configDir = mkdtempSync(join(tmpdir(), 'seo-config-permissions-'))
  process.env.SEO_CONFIG_DIR = configDir
  setKeyringForTests(keyring)
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) {
    delete process.env.SEO_CONFIG_DIR
  } else {
    process.env.SEO_CONFIG_DIR = previousConfigDir
  }
  setKeyringForTests()
})

test('config files stay private on write and read', () => {
  resetStorage()
  writeConfig(configSchema.parse({ providers: { semrushApiKey: 'secret' } }))

  const configFile = getSeoCliPaths().configFile
  assert.equal(mode(configFile), 0o600)

  chmodSync(configFile, 0o644)
  assert.equal(readConfig().providers.semrushApiKey, 'secret')
  assert.equal(mode(configFile), 0o600)
})

test('provider spend limits use safe defaults and typed local overrides', () => {
  resetStorage()
  writeConfig(configSchema.parse({}))

  assert.deepEqual(
    getProviderSpendLimits('dataforseo'),
    DEFAULT_PROVIDER_SPEND_LIMITS,
  )
  assert.deepEqual(
    setProviderSpendLimits('dataforseo', {
      dailyNoticeMicros: 2_500_000,
      dailyHardLimitMicros: 10_000_000,
      monthlyHardLimitMicros: null,
      maxRequestsPerReport: 8,
      maxRowsPerReport: 4_000,
    }),
    {
      dailyNoticeMicros: 2_500_000,
      dailyHardLimitMicros: 10_000_000,
      monthlyHardLimitMicros: null,
      maxRequestsPerReport: 8,
      maxRowsPerReport: 4_000,
    },
  )
  assert.equal(
    readConfig().providers.costLimits?.dataforseo?.dailyHardLimitMicros,
    10_000_000,
  )
})

test('moves a private token file into the system keychain', async () => {
  resetStorage()
  const tokens = testTokens()
  writeConfig(configSchema.parse({ security: { useKeychain: false } }))
  await writeTokens(tokens)

  const before = JSON.parse(
    readFileSync(getSeoCliPaths().tokensFile, 'utf8'),
  ) as StoredTokens
  assert.equal(before.refresh_token, 'refresh-token')

  const storage = await setTokenStorageMode('keychain')
  assert.deepEqual(storage, { configured: 'keychain', active: 'keychain' })
  assert.deepEqual(await readTokens(), tokens)
  assert.equal(
    keyring.values.get('seo:google:owner@example.com:refresh'),
    'refresh-token',
  )

  const after = JSON.parse(
    readFileSync(getSeoCliPaths().tokensFile, 'utf8'),
  ) as StoredTokens
  assert.equal(after.access_token, undefined)
  assert.equal(after.refresh_token, undefined)
  assert.equal(mode(getSeoCliPaths().tokensFile), 0o600)
})

test('falls back to a private token file when the keychain is unavailable', async () => {
  resetStorage()
  keyring.unavailable = true
  const tokens = testTokens()
  writeConfig(configSchema.parse({}))
  await writeTokens(tokens)

  assert.deepEqual(await readTokens(), tokens)
  assert.deepEqual(await getTokenStorageStatus(), {
    configured: 'keychain',
    active: 'file',
    reason:
      'Private token file will move to the keychain when it is available.',
  })
  assert.equal(mode(getSeoCliPaths().tokensFile), 0o600)
})

test('switches back to a private file and logout removes both stores', async () => {
  resetStorage()
  const tokens = testTokens()
  writeConfig(configSchema.parse({}))
  await writeTokens(tokens)

  const storage = await setTokenStorageMode('file')
  assert.deepEqual(storage, { configured: 'file', active: 'file' })
  assert.equal(
    keyring.values.get('seo:google:owner@example.com:refresh'),
    undefined,
  )
  assert.deepEqual(await readTokens(), tokens)

  await deleteTokens()
  assert.equal(existsSync(getSeoCliPaths().tokensFile), false)
  assert.equal(keyring.values.size, 0)
})

test('logout keeps token metadata when keychain deletion fails', async () => {
  resetStorage()
  writeConfig(configSchema.parse({}))
  await writeTokens(testTokens())
  const failedKey = 'seo:google:owner@example.com:refresh'
  keyring.failedDeletes.add(failedKey)

  await assert.rejects(
    deleteTokens(),
    /Google tokens could not be removed from the system keychain/i,
  )
  assert.equal(existsSync(getSeoCliPaths().tokensFile), true)
  assert.equal(keyring.values.get(failedKey), 'refresh-token')

  keyring.failedDeletes.clear()
  await deleteTokens()
  assert.equal(existsSync(getSeoCliPaths().tokensFile), false)
  assert.equal(keyring.values.size, 0)
})
