import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import {
  configSchema,
  type StoredTokenStore,
  type StoredTokens,
} from '../types.js'
import {
  deleteTokens,
  getTokenStorageStatus,
  listGoogleAccounts,
  readAllTokens,
  readConfig,
  readTokens,
  setActiveGoogleAccount,
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

test('moves a private token file into the system keychain', async () => {
  resetStorage()
  const tokens = testTokens()
  writeConfig(configSchema.parse({ security: { useKeychain: false } }))
  await writeTokens(tokens)

  const before = JSON.parse(
    readFileSync(getSeoCliPaths().tokensFile, 'utf8'),
  ) as StoredTokenStore
  assert.equal(before.accounts[0]?.refresh_token, 'refresh-token')

  const storage = await setTokenStorageMode('keychain')
  assert.deepEqual(storage, { configured: 'keychain', active: 'keychain' })
  assert.deepEqual(await readTokens(), tokens)
  assert.equal(
    keyring.values.get('seo:google:owner@example.com:refresh'),
    'refresh-token',
  )

  const after = JSON.parse(
    readFileSync(getSeoCliPaths().tokensFile, 'utf8'),
  ) as StoredTokenStore
  assert.equal(after.accounts[0]?.access_token, undefined)
  assert.equal(after.accounts[0]?.refresh_token, undefined)
  assert.equal(mode(getSeoCliPaths().tokensFile), 0o600)
})

test('keeps several Google accounts and selects one active account', async () => {
  resetStorage()
  writeConfig(configSchema.parse({ security: { useKeychain: false } }))
  const first = testTokens()
  const second = {
    ...testTokens(),
    account_email: 'analytics@example.com',
    access_token: 'analytics-access-token',
    refresh_token: 'analytics-refresh-token',
  }

  await writeTokens(first)
  await writeTokens(second)

  assert.equal((await readTokens())?.account_email, 'analytics@example.com')
  assert.deepEqual(
    (await readAllTokens()).map((tokens) => tokens.account_email),
    ['owner@example.com', 'analytics@example.com'],
  )
  assert.deepEqual(
    listGoogleAccounts().map((account) => ({
      email: account.accountEmail,
      active: account.active,
    })),
    [
      { email: 'owner@example.com', active: false },
      { email: 'analytics@example.com', active: true },
    ],
  )

  setActiveGoogleAccount('OWNER@example.com')
  assert.equal((await readTokens())?.account_email, 'owner@example.com')
  assert.equal(
    (await readTokens('analytics@example.com'))?.access_token,
    'analytics-access-token',
  )

  await deleteTokens('owner@example.com')
  assert.equal((await readTokens())?.account_email, 'analytics@example.com')
  assert.equal((await readAllTokens()).length, 1)
})

test('reads a legacy single-account token file and migrates it on write', async () => {
  resetStorage()
  writeConfig(configSchema.parse({ security: { useKeychain: false } }))
  const legacy = testTokens()
  writeFileSync(getSeoCliPaths().tokensFile, JSON.stringify(legacy), {
    mode: 0o600,
  })

  assert.deepEqual(await readTokens(), legacy)
  await writeTokens({
    ...testTokens(),
    account_email: 'second@example.com',
  })

  const stored = JSON.parse(
    readFileSync(getSeoCliPaths().tokensFile, 'utf8'),
  ) as StoredTokenStore
  assert.equal(stored.version, 2)
  assert.equal(stored.active_account, 'second@example.com')
  assert.deepEqual(
    stored.accounts.map((tokens) => tokens.account_email),
    ['owner@example.com', 'second@example.com'],
  )
})

test('keeps an existing refresh token when Google omits it on login', async () => {
  resetStorage()
  writeConfig(configSchema.parse({ security: { useKeychain: false } }))
  await writeTokens(testTokens())

  await writeTokens({
    ...testTokens(),
    access_token: 'new-access-token',
    refresh_token: undefined,
  })

  const tokens = await readTokens('owner@example.com')
  assert.equal(tokens?.access_token, 'new-access-token')
  assert.equal(tokens?.refresh_token, 'refresh-token')
})

test('falls back to a private token file when the keychain is unavailable', async () => {
  resetStorage()
  keyring.unavailable = true
  const tokens = testTokens()
  writeConfig(configSchema.parse({}))
  await writeTokens(tokens)

  assert.deepEqual(await readTokens(), tokens)
  keyring.unavailable = false
  assert.deepEqual(await readTokens(), tokens)
  assert.deepEqual(await getTokenStorageStatus(), {
    configured: 'keychain',
    active: 'file',
    reason:
      'Private token file will move to the keychain when it is available.',
  })
  assert.equal(mode(getSeoCliPaths().tokensFile), 0o600)
})

test('logout keeps token metadata when keychain deletion fails', async () => {
  resetStorage()
  writeConfig(configSchema.parse({}))
  await writeTokens(testTokens())
  const failedKey = 'seo:google:owner@example.com:refresh'
  keyring.failedDeletes.add(failedKey)

  await assert.rejects(deleteTokens())
  assert.equal(existsSync(getSeoCliPaths().tokensFile), true)
  assert.equal(keyring.values.get(failedKey), 'refresh-token')

  keyring.failedDeletes.clear()
  await deleteTokens()
  assert.equal(existsSync(getSeoCliPaths().tokensFile), false)
  assert.equal(keyring.values.size, 0)
})
