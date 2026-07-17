import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import {
  ResponseSizeLimitError,
  readBoundedResponseText,
} from './http-client.js'

test('bounded response reads accept bodies within the limit', async () => {
  const response = new Response('hello')

  assert.equal(await readBoundedResponseText(response, 5), 'hello')
})

test('bounded response reads reject declared and streamed oversized bodies', async () => {
  await assert.rejects(
    readBoundedResponseText(
      new Response('small', { headers: { 'content-length': '100' } }),
      10,
      'Page',
    ),
    (error) =>
      error instanceof ResponseSizeLimitError &&
      error.message === 'Page exceeds the 10-byte response limit.',
  )

  await assert.rejects(
    readBoundedResponseText(new Response('eleven bytes'), 10),
    ResponseSizeLimitError,
  )
})
