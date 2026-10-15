import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { SeoError } from '../errors.js'
import { readJson, readJsonOrUndefined } from './read-json.js'

test('reads plain JSON', async () => {
  assert.deepEqual(await readJson(Response.json({ ok: 1 }), 'Test'), { ok: 1 })
})

test('unzips a gzip body that arrived without its content-encoding header', async () => {
  const body = gzipSync(Buffer.from(JSON.stringify({ access_token: 'x' })))
  const response = new Response(body, {
    headers: { 'content-type': 'application/json' },
  })
  assert.deepEqual(await readJson(response, 'Google sign-in'), {
    access_token: 'x',
  })
})

test('names the endpoint when the body is not JSON', async () => {
  await assert.rejects(
    readJson(
      new Response('<html>blocked</html>', { status: 200 }),
      'Search Console',
    ),
    (error: unknown) =>
      error instanceof SeoError &&
      error.code === 'PROVIDER_UNAVAILABLE' &&
      /Search Console returned a response that is not JSON/.test(error.message),
  )
  assert.equal(
    await readJsonOrUndefined(new Response(''), 'Search Console'),
    undefined,
  )
})
