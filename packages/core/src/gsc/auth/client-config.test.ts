import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { configSchema, type StoredTokens } from '../../types.js'
import { SHARED_OAUTH_CLIENT } from '../shared-client.generated.js'

const configDir = mkdtempSync(join(tmpdir(), 'seo-auth-source-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const sharedEnvironment = [
  'SEO_GOOGLE_CLIENT_ID',
  'SEO_GOOGLE_CLIENT_SECRET',
  'GSC_CLIENT_ID',
  'GSC_CLIENT_SECRET',
] as const
const previousSharedEnvironment = Object.fromEntries(
  sharedEnvironment.map((name) => [name, process.env[name]]),
)

process.env.SEO_CONFIG_DIR = configDir

const { runDoctor } = await import('../../doctor.js')
const { SeoError } = await import('../../errors.js')
const { writeConfig, writeOauthClient, writeTokens } = await import(
  '../../storage/config.js'
)
const { authStatus, createAuthorizedClient } = await import(
  './authorized-client.js'
)
const { getClientConfig } = await import('./client-config.js')

function storedTokens(source: StoredTokens['client_source']): StoredTokens {
  return {
    provider: 'google',
    account_email: 'user@example.com',
    scope: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
    ].join(' '),
    token_type: 'Bearer',
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Date.now() + 60 * 60 * 1000,
    obtained_at: Date.now(),
    client_source: source,
  }
}

function setSharedClient(): void {
  process.env.SEO_GOOGLE_CLIENT_ID = 'shared-client-id'
  process.env.SEO_GOOGLE_CLIENT_SECRET = 'shared-client-secret'
}

function hasEmbeddedSharedClient(): boolean {
  return Boolean(
    SHARED_OAUTH_CLIENT.clientId && SHARED_OAUTH_CLIENT.clientSecret,
  )
}

beforeEach(() => {
  rmSync(configDir, { recursive: true, force: true })
  writeConfig(configSchema.parse({ security: { useKeychain: false } }))
  for (const name of sharedEnvironment) delete process.env[name]
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  for (const name of sharedEnvironment) {
    const value = previousSharedEnvironment[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('OAuth client lookup honors an explicit token source', () => {
  setSharedClient()
  writeOauthClient({
    clientId: 'byo-client-id',
    clientSecret: 'byo-client-secret',
  })

  assert.deepEqual(getClientConfig('shared'), {
    clientId: 'shared-client-id',
    clientSecret: 'shared-client-secret',
    source: 'shared',
  })
  assert.deepEqual(getClientConfig('byo'), {
    clientId: 'byo-client-id',
    clientSecret: 'byo-client-secret',
    source: 'byo',
  })
  assert.equal(getClientConfig()?.source, 'byo')
})

test('OAuth client lookup never falls back across token sources', () => {
  setSharedClient()
  assert.equal(getClientConfig('byo'), undefined)

  for (const name of sharedEnvironment) delete process.env[name]
  writeOauthClient({
    clientId: 'byo-client-id',
    clientSecret: 'byo-client-secret',
  })
  const shared = getClientConfig('shared')
  assert.equal(Boolean(shared), hasEmbeddedSharedClient())
  assert.equal(shared?.source, hasEmbeddedSharedClient() ? 'shared' : undefined)
})

test('auth status reports whether the stored token client is configured', async () => {
  writeOauthClient({
    clientId: 'byo-client-id',
    clientSecret: 'byo-client-secret',
  })
  await writeTokens(storedTokens('shared'))

  const status = await authStatus()

  assert.equal(status.configured, hasEmbeddedSharedClient())
  assert.equal(status.sharedConfigured, hasEmbeddedSharedClient())
  assert.equal(status.byoConfigured, true)
})

test('authorized clients reject a configured client from the wrong source', async () => {
  setSharedClient()
  await writeTokens(storedTokens('byo'))

  await assert.rejects(createAuthorizedClient(), (error: unknown) => {
    assert.ok(error instanceof SeoError)
    assert.equal(error.code, 'AUTH_CONFIG_REQUIRED')
    assert.match(error.message, /BYO OAuth client.*no longer configured/i)
    return true
  })
})

test('doctor reports whether the stored token client is configured', async () => {
  writeOauthClient({
    clientId: 'byo-client-id',
    clientSecret: 'byo-client-secret',
  })
  await writeTokens(storedTokens('shared'))

  const report = await runDoctor({
    checkDatabase: () => ({ dbPath: '/tmp/seo-test/cache.sqlite' }),
  })
  const oauth = report.checks.find((check) => check.id === 'oauth-client')
  const database = report.checks.find((check) => check.id === 'local-database')

  assert.equal(report.ok, hasEmbeddedSharedClient())
  assert.equal(database?.status, 'pass')
  assert.equal(oauth?.status, hasEmbeddedSharedClient() ? 'pass' : 'fail')
  if (hasEmbeddedSharedClient()) {
    assert.match(oauth?.detail ?? '', /shared client configured/i)
  } else {
    assert.match(oauth?.detail ?? '', /shared seo app.*not configured/i)
    assert.match(oauth?.fix ?? '', /github\.com\/iannuttall\/seo\/issues/)
  }
})

test('doctor fails clearly when the local database cannot open', async () => {
  const report = await runDoctor({
    checkDatabase: () => {
      throw new Error('SQLite runtime is unavailable.')
    },
  })
  const database = report.checks.find((check) => check.id === 'local-database')

  assert.equal(report.ok, false)
  assert.equal(database?.status, 'fail')
  assert.match(database?.detail ?? '', /SQLite runtime is unavailable/)
  assert.match(database?.fix ?? '', /Upgrade or reinstall `seo`/)
})
