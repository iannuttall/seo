import assert from 'node:assert/strict'
import test from 'node:test'
import { handleNoindexCheck, type NoindexResult } from './noindex-checker.ts'

function request(url: string): Request {
  return new Request('https://seoskill.dev/api/tools/noindex-checker', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

type Route = {
  status?: number
  headers?: Record<string, string>
  body?: string
}

function site(routes: Record<string, Route>) {
  const fetched: string[] = []
  const fetcher = async (input: RequestInfo | URL) => {
    const url = input.toString()
    fetched.push(url)
    const route = routes[url]
    if (!route) return new Response('missing', { status: 404 })
    return new Response(route.body ?? '', {
      status: route.status ?? 200,
      headers: { 'content-type': 'text/html', ...route.headers },
    })
  }
  return { fetcher, fetched }
}

async function check(url: string, routes: Record<string, Route>) {
  const { fetcher, fetched } = site(routes)
  const response = await handleNoindexCheck(request(url), fetcher)
  return { response, fetched, result: (await response.json()) as NoindexResult }
}

test('a googlebot meta tag on the page a redirect lands on is a noindex for Google', async () => {
  const { result } = await check('https://example.com/old', {
    'https://example.com/old': {
      status: 301,
      headers: { location: '/new' },
    },
    'https://example.com/new': {
      body: '<html><head><meta name="robots" content="index, follow"><meta name="googlebot" content="noindex"><meta name="bingbot" content="nofollow"></head><body></body></html>',
    },
    'https://example.com/robots.txt': {
      headers: { 'content-type': 'text/plain' },
      body: 'User-agent: *\nDisallow: /private/\n',
    },
  })
  assert.equal(result.verdict, 'noindex')
  assert.equal(result.finalUrl, 'https://example.com/new')
  assert.equal(result.google.noindex, true)
  assert.equal(result.bingNoindex, false)
  assert.deepEqual(
    result.hops.map((hop) => hop.status),
    [301, 200],
  )
})

test('an X-Robots-Tag scoped to another crawler does not noindex the page for Google', async () => {
  const { result } = await check('https://example.com/page', {
    'https://example.com/page': {
      headers: { 'x-robots-tag': 'bingbot: noindex' },
      body: '<html><head><title>Page</title></head><body></body></html>',
    },
  })
  assert.equal(result.verdict, 'indexable')
  assert.equal(result.bingNoindex, true)
})

test('robots.txt blocking a noindex page means Google never sees the noindex', async () => {
  const { result } = await check('https://example.com/login', {
    'https://example.com/login': {
      body: '<html><head><meta name="robots" content="noindex"></head></html>',
    },
    'https://example.com/robots.txt': {
      headers: { 'content-type': 'text/plain' },
      body: 'User-agent: Googlebot\nDisallow: /login\n',
    },
  })
  assert.equal(result.verdict, 'blocked-noindex')
  assert.equal(result.robotsTxt?.state, 'blocked')
})

test('an unavailable_after date in the past counts as noindex', async () => {
  const { result } = await check('https://example.com/offer', {
    'https://example.com/offer': {
      body: '<html><head><meta name="robots" content="unavailable_after: 2020-01-01"></head></html>',
    },
  })
  assert.equal(result.verdict, 'noindex')
})

test('a robots tag inside a script or comment is not read as a directive', async () => {
  const { result } = await check('https://example.com/app', {
    'https://example.com/app': {
      body: '<html><head><!-- <meta name="robots" content="noindex"> --><script>const tag = \'<meta name="robots" content="noindex">\'</script></head></html>',
    },
  })
  assert.equal(result.verdict, 'indexable')
})

test('a redirect to a private address is not followed', async () => {
  const { result, fetched } = await check('https://example.com/go', {
    'https://example.com/go': {
      status: 302,
      headers: { location: 'http://127.0.0.1/admin' },
    },
  })
  assert.equal(result.verdict, 'redirect-failed')
  assert.ok(!fetched.some((url) => url.includes('127.0.0.1')))
})

test('a redirect loop is reported as a loop', async () => {
  const { result } = await check('https://example.com/a', {
    'https://example.com/a': { status: 301, headers: { location: '/b' } },
    'https://example.com/b': { status: 301, headers: { location: '/a' } },
  })
  assert.equal(result.verdict, 'redirect-failed')
  assert.equal(result.headline, 'Redirect loop')
})
