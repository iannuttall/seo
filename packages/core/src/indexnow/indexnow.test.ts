import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { submitIndexNow } from './client.js'
import { createIndexNowKeyRecord } from './keys.js'

const record = createIndexNowKeyRecord({
  site: 'https://example.test/articles',
  key: 'abc12345',
  now: new Date('2026-01-02T03:04:05.000Z'),
})

test('submissions verify the key before posting a bounded payload', async () => {
  const requests: Array<{ url: string; method?: string; body?: string }> = []
  const result = await submitIndexNow({
    record,
    urls: ['https://example.test/b', 'https://example.test/a'],
    fetchImpl: async (url, init) => {
      requests.push({
        url,
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined,
      })
      return requests.length === 1
        ? new Response('abc12345\n', { status: 200 })
        : new Response('', { status: 202 })
    },
  })
  assert.equal(requests.length, 2)
  assert.equal(requests[0]?.url, record.keyLocation)
  assert.equal(requests[1]?.url, 'https://api.indexnow.org/indexnow')
  assert.equal(requests[1]?.method, 'POST')
  assert.deepEqual(JSON.parse(requests[1]?.body ?? '{}'), {
    host: 'example.test',
    key: 'abc12345',
    keyLocation: record.keyLocation,
    urlList: ['https://example.test/a', 'https://example.test/b'],
  })
  assert.equal(result.status, 'pending-validation')
  assert.equal(result.responseStatus, 202)
})

test('failed key verification prevents submission', async () => {
  let requests = 0
  await assert.rejects(
    submitIndexNow({
      record,
      urls: ['https://example.test/a'],
      fetchImpl: async () => {
        requests += 1
        return new Response('wrong-key', { status: 200 })
      },
    }),
  )
  assert.equal(requests, 1)
})
