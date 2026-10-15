import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleLlmsTxtFetch, type LlmsTxtToolResult } from './llms-txt.ts'

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
