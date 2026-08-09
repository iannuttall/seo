import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAhrefsDomainRating } from './ahrefs-domain-rating.ts'
import { ProviderAdapterError } from './provider-adapter.ts'

const now = () => new Date('2026-08-09T10:30:00.000Z')

test('requests the Ahrefs free endpoint with exact attribution', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const result = await checkAhrefsDomainRating(
    { target: 'www.example.com/', apiKey: 'ahrefs-key' },
    {
      now,
      fetch: async (input, init) => {
        capturedUrl = input.toString()
        capturedInit = init
        return Response.json({
          domain_rating: {
            domain_rating: 73.4,
            license: 'licensed',
            warning: null,
          },
        })
      },
    },
  )

  assert.equal(
    capturedUrl,
    'https://api.ahrefs.com/v3/public/domain-rating-free?target=example.com',
  )
  assert.ok(capturedInit)
  assert.equal(
    new Headers(capturedInit.headers).get('authorization'),
    'Bearer ahrefs-key',
  )
  assert.equal(result.dataStatus, 'complete')
  assert.equal(result.domainRating, 73.4)
  assert.deepEqual(result.provenance.attribution, {
    label: 'Domain Rating by Ahrefs',
    url: 'https://ahrefs.com/',
    licenseUrl: 'https://ahrefs.com/legal/domain-rating-license',
  })
})

test('does not convert a missing Domain Rating to zero or expose warning text', async () => {
  const secretWarning = 'internal provider detail 123'
  const result = await checkAhrefsDomainRating(
    { target: 'example.com', apiKey: 'ahrefs-key' },
    {
      now,
      fetch: async () =>
        Response.json({
          domain_rating: { domain_rating: null, warning: secretWarning },
        }),
    },
  )

  assert.equal(result.dataStatus, 'unavailable')
  assert.equal(result.domainRating, null)
  assert.equal(result.provenance.providerWarningReceived, true)
  assert.doesNotMatch(JSON.stringify(result), /internal provider detail|123/u)
})

test('maps Ahrefs rate limits to a safe retryable error', async () => {
  await assert.rejects(
    checkAhrefsDomainRating(
      { target: 'example.com', apiKey: 'ahrefs-key' },
      {
        fetch: async () => new Response('raw provider error', { status: 429 }),
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError)
      assert.equal(error.code, 'rate-limited')
      assert.equal(error.retryable, true)
      assert.doesNotMatch(error.message, /raw provider error/u)
      return true
    },
  )
})
