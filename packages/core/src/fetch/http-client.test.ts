import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import {
  ResponseSizeLimitError,
  readBoundedResponseText,
  requestHeaders,
  SEO_CRAWLER_TOKEN,
  SEO_CRAWLER_USER_AGENT,
} from './http-client.js'

test('all HTTP profiles use the stable versioned crawler identity', () => {
  assert.equal(SEO_CRAWLER_TOKEN, 'SEO-Skill')
  assert.match(
    SEO_CRAWLER_USER_AGENT,
    /^SEO-Skill\/\d+\.\d+\.\d+ \(\+https:\/\/seoskill\.dev\)$/,
  )
  assert.equal(requestHeaders('bot').get('user-agent'), SEO_CRAWLER_USER_AGENT)
  assert.equal(
    requestHeaders('browser').get('user-agent'),
    SEO_CRAWLER_USER_AGENT,
  )
})

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
