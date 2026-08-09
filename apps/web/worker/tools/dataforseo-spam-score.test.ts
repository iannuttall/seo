import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkDataForSeoSpamScore,
  type DataForSeoSpamScoreResult,
} from './dataforseo-spam-score.ts'
import { ProviderAdapterError } from './provider-adapter.ts'

const now = () => new Date('2026-08-09T10:30:00.000Z')

function dataForSeoResponse(
  items: unknown[],
  task: Record<string, unknown> = {},
): Response {
  return Response.json({
    status_code: 20_000,
    tasks: [
      {
        status_code: 20_000,
        cost: 0.02,
        result: [{ items }],
        ...task,
      },
    ],
  })
}

test('preserves a normalized absolute page URL for DataForSEO Spam Score', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const result = await checkDataForSeoSpamScore(
    {
      target: 'https://www.Example.com/path?query=yes',
      login: 'account@example.com',
      password: 'secret',
    },
    {
      now,
      fetch: async (input, init) => {
        capturedUrl = input.toString()
        capturedInit = init
        return dataForSeoResponse([
          {
            type: 'backlinks_bulk_spam_score',
            target: 'https://www.example.com/path?query=yes',
            spam_score: 27,
          },
        ])
      },
    },
  )

  assert.equal(
    capturedUrl,
    'https://api.dataforseo.com/v3/backlinks/bulk_spam_score/live',
  )
  assert.equal(capturedInit?.method, 'POST')
  assert.ok(capturedInit)
  assert.equal(
    new Headers(capturedInit.headers).get('authorization'),
    `Basic ${btoa('account@example.com:secret')}`,
  )
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), [
    { targets: ['https://www.example.com/path?query=yes'] },
  ])
  assert.deepEqual(result, {
    schema: 1,
    target: 'https://www.example.com/path?query=yes',
    dataStatus: 'complete',
    spamScore: 27,
    warnings: [
      {
        code: 'provider-estimate',
        message:
          'DataForSEO Spam Score is a third-party estimate. It is not a Google metric or proof of a search penalty.',
      },
    ],
    provenance: {
      provider: 'dataforseo',
      endpoint: 'https://api.dataforseo.com/v3/backlinks/bulk_spam_score/live',
      checkedAt: '2026-08-09T10:30:00.000Z',
      providerCostUsd: 0.02,
      attribution: {
        label: 'Spam Score by DataForSEO',
        url: 'https://dataforseo.com/',
      },
      limits: { requestedTargets: 1, returnedTargets: 1 },
    },
  } satisfies DataForSeoSpamScoreResult)
})

test('normalizes a root URL as a domain target', async () => {
  const result = await checkDataForSeoSpamScore(
    {
      target: 'https://www.Example.com/#section',
      login: 'login',
      password: 'password',
    },
    {
      now,
      fetch: async (_input, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)), [
          { targets: ['example.com'] },
        ])
        return dataForSeoResponse([
          {
            type: 'backlinks_bulk_spam_score',
            target: 'example.com',
            spam_score: 0,
          },
        ])
      },
    },
  )

  assert.equal(result.target, 'example.com')
  assert.equal(result.spamScore, 0)
})

test('turns a scheme-less page path into an absolute provider target', async () => {
  const result = await checkDataForSeoSpamScore(
    {
      target: 'example.com/docs/page#details',
      login: 'login',
      password: 'password',
    },
    {
      now,
      fetch: async (_input, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)), [
          { targets: ['https://example.com/docs/page'] },
        ])
        return dataForSeoResponse([
          {
            type: 'backlinks_bulk_spam_score',
            target: 'https://example.com/docs/page',
            spam_score: 12,
          },
        ])
      },
    },
  )

  assert.equal(result.target, 'https://example.com/docs/page')
})

test('keeps a missing score distinct from zero', async () => {
  const result = await checkDataForSeoSpamScore(
    { target: 'example.com', login: 'login', password: 'password' },
    { now, fetch: async () => dataForSeoResponse([]) },
  )

  assert.equal(result.dataStatus, 'unavailable')
  assert.equal(result.spamScore, null)
  assert.equal(result.provenance.limits.returnedTargets, 0)
  assert.ok(
    result.warnings.some((warning) => warning.code === 'metric-unavailable'),
  )
})

test('rejects non-public targets before provider acquisition', async () => {
  let calls = 0
  await assert.rejects(
    checkDataForSeoSpamScore(
      { target: 'http://localhost/admin', login: 'login', password: 'secret' },
      {
        fetch: async () => {
          calls += 1
          return dataForSeoResponse([])
        },
      },
    ),
    (error: unknown) =>
      error instanceof ProviderAdapterError && error.code === 'invalid-target',
  )
  assert.equal(calls, 0)
})

test('does not expose provider error payloads', async () => {
  const rawMessage = 'account balance secret 123'
  await assert.rejects(
    checkDataForSeoSpamScore(
      { target: 'example.com', login: 'login', password: 'secret' },
      {
        fetch: async () =>
          Response.json({ status_code: 40_200, status_message: rawMessage }),
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError)
      assert.equal(error.code, 'upstream-unavailable')
      assert.doesNotMatch(error.message, /balance|secret|123/u)
      return true
    },
  )
})

test('bounds provider responses before parsing them', async () => {
  await assert.rejects(
    checkDataForSeoSpamScore(
      { target: 'example.com', login: 'login', password: 'secret' },
      {
        responseByteLimit: 32,
        fetch: async () =>
          new Response('{"status_code":20000}', {
            headers: { 'content-length': '1000' },
          }),
      },
    ),
    (error: unknown) =>
      error instanceof ProviderAdapterError &&
      error.code === 'response-too-large',
  )
})
