import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { submitIndexNow, verifyIndexNowKey } from './client.js'
import {
  createIndexNowKeyRecord,
  parseIndexNowSite,
  resolveIndexNowKey,
  validateIndexNowKey,
} from './keys.js'

const record = createIndexNowKeyRecord({
  site: 'https://example.test/articles',
  key: 'abc12345',
  now: new Date('2026-01-02T03:04:05.000Z'),
})

test('IndexNow key records use the site root and reject unsafe values', () => {
  assert.deepEqual(record, {
    host: 'example.test',
    key: 'abc12345',
    keyLocation: 'https://example.test/abc12345.txt',
    createdAt: '2026-01-02T03:04:05.000Z',
  })
  assert.equal(validateIndexNowKey(' abc-12345 '), 'abc-12345')
  assert.throws(() => validateIndexNowKey('short'), /8 to 128/)
  assert.throws(
    () =>
      createIndexNowKeyRecord({
        site: 'https://example.test',
        key: 'abc12345',
        keyLocation: 'https://other.test/abc12345.txt',
      }),
    /same host/,
  )
  assert.throws(() => parseIndexNowSite('file:///tmp/key'), /HTTP or HTTPS/)
  assert.throws(
    () => parseIndexNowSite('http://127.0.0.1:3000'),
    /public site host/,
  )
  assert.throws(
    () => parseIndexNowSite('http://192.168.1.2'),
    /public site host/,
  )
})

test('environment keys resolve without touching local storage', async () => {
  const resolved = await resolveIndexNowKey({
    site: 'https://example.test/path',
    env: { SEO_INDEXNOW_KEY: 'environment-key' },
  })
  assert.equal(resolved.source, 'environment')
  assert.equal(resolved.record.key, 'environment-key')
  assert.equal(
    resolved.record.keyLocation,
    'https://example.test/environment-key.txt',
  )
})

test('dry runs validate, normalize, deduplicate, and never fetch', async () => {
  let requests = 0
  const result = await submitIndexNow({
    record,
    urls: [
      'https://example.test/b#fragment',
      'https://example.test/a',
      'https://example.test/b',
    ],
    dryRun: true,
    now: new Date('2026-02-03T04:05:06.000Z'),
    fetchImpl: async () => {
      requests += 1
      return new Response()
    },
  })
  assert.equal(requests, 0)
  assert.equal(result.status, 'validated')
  assert.equal(result.submittedUrls, 2)
  assert.equal(result.generatedAt, '2026-02-03T04:05:06.000Z')
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
    /Deploy the generated key file/,
  )
  assert.equal(requests, 1)
})

test('URL host and local batch limits are enforced before network work', async () => {
  await assert.rejects(
    submitIndexNow({
      record,
      urls: ['https://other.test/a'],
      dryRun: true,
    }),
    /belong to example\.test/,
  )
  await assert.rejects(
    submitIndexNow({
      record,
      urls: Array.from(
        { length: 1_001 },
        (_, index) => `https://example.test/${index}`,
      ),
      dryRun: true,
    }),
    /limited to 1000 URLs/,
  )
})

test('key verification requires an exact small public file', async () => {
  assert.deepEqual(
    await verifyIndexNowKey({
      record,
      fetchImpl: async () => new Response('abc12345\n', { status: 200 }),
    }),
    {
      verified: true,
      status: 200,
      keyLocation: record.keyLocation,
    },
  )
})
