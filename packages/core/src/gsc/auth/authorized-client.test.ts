import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, beforeEach, test } from 'node:test'
import { configSchema, type StoredTokens } from '../../types.js'
import { GOOGLE_SCOPE } from './types.js'

const configDir = mkdtempSync(join(tmpdir(), 'seo-token-refresh-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const originalFetch = globalThis.fetch

process.env.SEO_CONFIG_DIR = configDir

const { SeoError } = await import('../../errors.js')
const { readTokens, writeConfig, writeOauthClient, writeTokens } = await import(
  '../../storage/config.js'
)
const { createAuthorizedClient, refreshAuthToken } = await import(
  './authorized-client.js'
)
const { GoogleTokenEndpointError, requestGoogleAccessToken } = await import(
  './token-endpoint.js'
)

function storedTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    provider: 'google',
    account_email: 'user@example.com',
    scope: GOOGLE_SCOPE,
    token_type: 'Bearer',
    access_token: 'old-access-token',
    refresh_token: 'old-refresh-token',
    expires_at: Date.now() - 1,
    obtained_at: Date.now() - 3_600_000,
    client_source: 'byo',
    ...overrides,
  }
}

beforeEach(() => {
  rmSync(configDir, { recursive: true, force: true })
  writeConfig(configSchema.parse({ security: { useKeychain: false } }))
  writeOauthClient({
    clientId: 'byo-client-id',
    clientSecret: 'byo-client-secret',
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
})

test('raw refresh request uses the Google token endpoint and form body', async () => {
  let requestUrl = ''
  let requestInit: RequestInit | undefined
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requestUrl = String(url)
    requestInit = init
    return new Response(
      JSON.stringify({
        access_token: 'next-access-token',
        expires_in: 3_600,
        token_type: 'Bearer',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch

  const result = await requestGoogleAccessToken(
    {
      clientConfig: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        source: 'byo',
      },
      refreshToken: 'refresh-token',
    },
    fetchImpl,
  )

  assert.equal(requestUrl, 'https://oauth2.googleapis.com/token')
  assert.equal(requestInit?.method, 'POST')
  assert.equal(
    new Headers(requestInit?.headers).get('content-type'),
    'application/x-www-form-urlencoded',
  )
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(String(requestInit?.body))),
    {
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
    },
  )
  assert.deepEqual(result, {
    accessToken: 'next-access-token',
    expiresIn: 3_600,
    refreshToken: undefined,
  })
})

test('refresh updates stored access data without changing its client source', async () => {
  await writeTokens(storedTokens())
  const requestedAt = Date.now()
  globalThis.fetch = (async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = new URLSearchParams(String(init?.body))
    assert.equal(body.get('client_id'), 'byo-client-id')
    assert.equal(body.get('refresh_token'), 'old-refresh-token')
    return new Response(
      JSON.stringify({
        access_token: 'next-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3_600,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch

  const refreshed = await refreshAuthToken()

  assert.equal(refreshed.access_token, 'next-access-token')
  assert.equal(refreshed.refresh_token, 'rotated-refresh-token')
  assert.ok(refreshed.expires_at >= requestedAt + 3_600_000)
  assert.ok(refreshed.expires_at <= Date.now() + 3_600_000)
  assert.equal(refreshed.client_source, 'byo')
  assert.deepEqual(await readTokens(), refreshed)
})

test('concurrent authorized clients refresh an expiring token once under lock', async () => {
  await writeTokens(storedTokens())
  let requests = 0
  globalThis.fetch = (async () => {
    requests += 1
    return new Response(
      JSON.stringify({
        access_token: 'next-access-token',
        expires_in: 3_600,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch

  const [first, second] = await Promise.all([
    createAuthorizedClient(),
    createAuthorizedClient(),
  ])

  assert.equal(requests, 1)
  assert.equal(await first.client.getAccessToken(), 'next-access-token')
  assert.equal(await second.client.getAccessToken(), 'next-access-token')
  assert.equal(first.tokens.client_source, 'byo')
  assert.equal(second.tokens.client_source, 'byo')
})

test('invalid grants delete stored tokens and return the auth-expired contract', async () => {
  await writeTokens(storedTokens())
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'invalid_grant' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch

  await assert.rejects(refreshAuthToken(), (error: unknown) => {
    assert.ok(error instanceof SeoError)
    assert.equal(error.code, 'AUTH_EXPIRED')
    return true
  })
  assert.equal(await readTokens(), undefined)
})

test('transient refresh errors preserve stored tokens for a retry', async () => {
  const stored = storedTokens()
  await writeTokens(stored)
  globalThis.fetch = (async () =>
    new Response('Unavailable', { status: 503 })) as typeof fetch

  await assert.rejects(refreshAuthToken(), (error: unknown) => {
    assert.ok(error instanceof GoogleTokenEndpointError)
    assert.equal(error.status, 503)
    return true
  })
  assert.deepEqual(await readTokens(), stored)
})

test('an expiring login without a refresh token requires login again', async () => {
  await writeTokens(storedTokens({ refresh_token: undefined }))

  await assert.rejects(createAuthorizedClient(), (error: unknown) => {
    assert.ok(error instanceof SeoError)
    assert.equal(error.code, 'AUTH_EXPIRED')
    return true
  })
  assert.equal(await readTokens(), undefined)
})

test('a login missing data scopes fails before calling Google APIs', async () => {
  await writeTokens(
    storedTokens({
      scope: 'openid https://www.googleapis.com/auth/userinfo.email',
      expires_at: Date.now() + 3_600_000,
    }),
  )

  await assert.rejects(createAuthorizedClient(), (error: unknown) => {
    assert.ok(error instanceof SeoError)
    assert.equal(error.code, 'ACCESS_DENIED')
    assert.match(error.message, /choose Select all/)
    assert.match(error.message, /Search Console and Google Analytics/)
    return true
  })
})
