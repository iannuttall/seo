import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDataForSeoSpamScore } from './dataforseo-spam-score.ts'
import { ProviderAdapterError } from './provider-adapter.ts'

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
