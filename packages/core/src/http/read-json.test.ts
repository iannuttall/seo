import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { readJson } from './read-json.js'

test('unzips a gzip body that arrived without its content-encoding header', async () => {
  const body = gzipSync(Buffer.from(JSON.stringify({ access_token: 'x' })))
  const response = new Response(body, {
    headers: { 'content-type': 'application/json' },
  })
  assert.deepEqual(await readJson(response, 'Google sign-in'), {
    access_token: 'x',
  })
})
