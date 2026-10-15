import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  handleRobotsTxtFetch,
  ROBOTS_TXT_FETCH_LIMITS,
  type RobotsTxtFetchResult,
} from './robots-txt.ts'

const endpoint = 'https://seoskill.dev/api/tools/robots-txt'

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

test('normalizes a submitted page or domain to the origin robots.txt file', async () => {
  const seen: string[] = []
  const response = await handleRobotsTxtFetch(
    request('example.com/private/page?x=1'),
    async (input, init) => {
      seen.push(input.toString())
      assert.equal(init?.redirect, 'manual')
      return new Response('User-agent: *\nDisallow: /private\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    },
  )

  assert.equal(response.status, 200)
  const result = (await response.json()) as RobotsTxtFetchResult
  assert.deepEqual(seen, ['https://example.com/robots.txt'])
  assert.equal(result.source.requestedUrl, 'https://example.com/robots.txt')
  assert.equal(result.source.origin, 'https://example.com')
  assert.equal(result.source.availability, 'rules')
  assert.equal(result.source.looksLikeHtml, false)
  assert.match(result.content, /Disallow/u)
})

test('retains only the first 500 KiB and marks larger files as truncated', async () => {
  const response = await handleRobotsTxtFetch(
    request('https://example.com'),
    async () =>
      new Response(
        `User-agent: *\n#${'x'.repeat(ROBOTS_TXT_FETCH_LIMITS.fileBytes)}`,
      ),
  )
  const result = (await response.json()) as RobotsTxtFetchResult

  assert.equal(response.status, 200)
  assert.equal(result.source.bytes, ROBOTS_TXT_FETCH_LIMITS.fileBytes)
  assert.equal(result.source.truncated, true)
  assert.equal(
    new TextEncoder().encode(result.content).byteLength,
    ROBOTS_TXT_FETCH_LIMITS.fileBytes,
  )
})

test('rejects private inputs and cross-site browser requests before fetching', async () => {
  let fetches = 0
  const fetcher = async () => {
    fetches += 1
    return new Response('')
  }

  const privateResponse = await handleRobotsTxtFetch(
    request('https://127.0.0.1/'),
    fetcher,
  )
  const insecureResponse = await handleRobotsTxtFetch(
    request('http://example.com/'),
    fetcher,
  )
  const crossSiteResponse = await handleRobotsTxtFetch(
    request('https://example.com/', {
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

test('revalidates redirect destinations before another request', async () => {
  let fetches = 0
  const response = await handleRobotsTxtFetch(
    request('https://example.com'),
    async () => {
      fetches += 1
      return new Response(null, {
        status: 302,
        headers: { location: 'https://localhost/private' },
      })
    },
  )

  assert.equal(response.status, 422)
  assert.equal(fetches, 1)
  assert.match(JSON.stringify(await response.json()), /cannot be fetched/u)
})
