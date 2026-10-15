import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import { SeoError } from '../../errors.js'
import {
  getServiceAccountConfig,
  getServiceAccountStatus,
  ServiceAccountAccessTokenClient,
} from './service-account.js'

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKey = pair.privateKey.export({
  format: 'pem',
  type: 'pkcs8',
}) as string

function credential(): string {
  return JSON.stringify({
    type: 'service_account',
    client_email: 'seo-ci@example.iam.gserviceaccount.com',
    private_key_id: 'key-id',
    private_key: privateKey,
  })
}

test('rejects conflicting or incomplete service account credential sources', () => {
  assert.throws(
    () =>
      getServiceAccountConfig({
        SEO_GOOGLE_SERVICE_ACCOUNT_JSON: credential(),
        SEO_GOOGLE_SERVICE_ACCOUNT_FILE: '/tmp/google.json',
      }),
    (error: unknown) => {
      assert.ok(error instanceof SeoError)
      assert.equal(error.code, 'AUTH_CONFIG_REQUIRED')
      return true
    },
  )

  const status = getServiceAccountStatus({
    SEO_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      client_email: 'seo-ci@example.iam.gserviceaccount.com',
    }),
  })
  assert.equal(status.configured, false)
  assert.equal(status.source, 'environment-json')
  assert.doesNotMatch(status.error ?? '', /BEGIN PRIVATE KEY/)
})

test('service accounts request readonly tokens and cache a valid result', async () => {
  const config = getServiceAccountConfig({
    SEO_GOOGLE_SERVICE_ACCOUNT_JSON: credential(),
  })
  assert.ok(config)

  let requests = 0
  const client = new ServiceAccountAccessTokenClient(config, (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests += 1
    assert.equal(String(url), 'https://oauth2.googleapis.com/token')
    assert.equal(init?.method, 'POST')
    assert.equal(
      new Headers(init?.headers).get('content-type'),
      'application/x-www-form-urlencoded',
    )

    const body = new URLSearchParams(String(init?.body))
    assert.equal(
      body.get('grant_type'),
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    )
    const assertion = body.get('assertion')
    assert.ok(assertion)
    const payload = JSON.parse(
      Buffer.from(assertion.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    assert.deepEqual(
      payload.scope,
      [
        'https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/analytics.readonly',
      ].join(' '),
    )
    assert.equal(payload.iss, 'seo-ci@example.iam.gserviceaccount.com')
    assert.equal(payload.aud, 'https://oauth2.googleapis.com/token')
    assert.equal(typeof payload.iat, 'number')
    assert.equal(typeof payload.exp, 'number')

    return new Response(
      JSON.stringify({
        access_token: 'service-account-access-token',
        expires_in: 3_600,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch)

  assert.equal(await client.getAccessToken(), 'service-account-access-token')
  assert.equal(await client.getAccessToken(), 'service-account-access-token')
  assert.equal(requests, 1)
})

test('service account token rejection gives a safe remediation message', async () => {
  const config = getServiceAccountConfig({
    SEO_GOOGLE_SERVICE_ACCOUNT_JSON: credential(),
  })
  assert.ok(config)
  const client = new ServiceAccountAccessTokenClient(
    config,
    (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
  )

  await assert.rejects(client.getAccessToken(), (error: unknown) => {
    assert.ok(error instanceof SeoError)
    assert.equal(error.code, 'AUTH_CONFIG_REQUIRED')
    assert.match(error.message, /invalid_grant/)
    assert.doesNotMatch(error.message, /BEGIN PRIVATE KEY/)
    return true
  })
})
