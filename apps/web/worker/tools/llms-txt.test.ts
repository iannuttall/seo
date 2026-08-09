import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  handleLlmsTxtFetch,
  LLMS_TXT_TOOL_LIMITS,
  type LlmsTxtToolResult,
} from './llms-txt.ts'

const endpoint = 'https://seoskill.dev/api/tools/llms-txt'

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://seoskill.dev',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify({ url }),
  })
}

test('fetches one public llms.txt file with bounded source details', async () => {
  const seen: string[] = []
  const response = await handleLlmsTxtFetch(
    request('https://example.com/llms.txt#top'),
    async (input, init) => {
      seen.push(input.toString())
      assert.equal(init?.redirect, 'manual')
      return new Response('# Example\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    },
  )

  assert.equal(response.status, 200)
  const result = (await response.json()) as LlmsTxtToolResult
  assert.deepEqual(seen, ['https://example.com/llms.txt'])
  assert.equal(result.content, '# Example\n')
  assert.equal(result.source.requestedUrl, 'https://example.com/llms.txt')
  assert.equal(result.source.finalUrl, 'https://example.com/llms.txt')
  assert.equal(result.source.bytes, 10)
  assert.equal(result.source.limits.fileBytes, 100_000)
})

test('follows safe redirects and retains the final URL', async () => {
  const seen: string[] = []
  const response = await handleLlmsTxtFetch(
    request('https://example.com/llms.txt'),
    async (input) => {
      const url = input.toString()
      seen.push(url)
      if (seen.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: '/docs/llms.txt' },
        })
      }
      return new Response('# Docs\n')
    },
  )

  const result = (await response.json()) as LlmsTxtToolResult
  assert.equal(response.status, 200)
  assert.deepEqual(seen, [
    'https://example.com/llms.txt',
    'https://example.com/docs/llms.txt',
  ])
  assert.equal(result.source.finalUrl, 'https://example.com/docs/llms.txt')
})

test('rejects unsafe input and cross-site browser requests before fetching', async () => {
  let fetches = 0
  const fetcher = async () => {
    fetches += 1
    return new Response('# Example\n')
  }

  const privateResponse = await handleLlmsTxtFetch(
    request('https://127.0.0.1/llms.txt'),
    fetcher,
  )
  const insecureResponse = await handleLlmsTxtFetch(
    request('http://example.com/llms.txt'),
    fetcher,
  )
  const crossSiteResponse = await handleLlmsTxtFetch(
    request('https://example.com/llms.txt', {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    }),
    fetcher,
  )

  assert.equal(privateResponse.status, 400)
  assert.equal(insecureResponse.status, 400)
  assert.equal(crossSiteResponse.status, 404)
  assert.equal(fetches, 0)
})

test('revalidates redirect destinations before another subrequest', async () => {
  let fetches = 0
  const response = await handleLlmsTxtFetch(
    request('https://example.com/llms.txt'),
    async () => {
      fetches += 1
      return new Response(null, {
        status: 302,
        headers: { location: 'https://localhost/private.txt' },
      })
    },
  )

  assert.equal(response.status, 422)
  assert.equal(fetches, 1)
  assert.match(JSON.stringify(await response.json()), /cannot be fetched/u)
})

test('rejects declared and streamed files over the byte limit', async () => {
  const declared = await handleLlmsTxtFetch(
    request('https://example.com/llms.txt'),
    async () =>
      new Response('small', {
        headers: {
          'content-length': String(LLMS_TXT_TOOL_LIMITS.fileBytes + 1),
        },
      }),
  )
  const streamed = await handleLlmsTxtFetch(
    request('https://example.com/llms.txt'),
    async () => new Response('x'.repeat(LLMS_TXT_TOOL_LIMITS.fileBytes + 1)),
  )

  assert.equal(declared.status, 413)
  assert.equal(streamed.status, 413)
})

test('rejects HTML error pages returned with a successful status', async () => {
  const response = await handleLlmsTxtFetch(
    request('https://example.com/llms.txt'),
    async () =>
      new Response('<!doctype html><title>Not found</title>', {
        headers: { 'content-type': 'text/html' },
      }),
  )

  assert.equal(response.status, 422)
  assert.match(JSON.stringify(await response.json()), /HTML page/u)
})
