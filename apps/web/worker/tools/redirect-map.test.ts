import assert from 'node:assert/strict'
import test from 'node:test'
import {
  handleRedirectMap,
  REDIRECT_MAP_LIMITS,
  type RedirectMapRowResult,
  type RedirectMapSummary,
} from './redirect-map.ts'

function request(body: unknown): Request {
  return new Request('https://seoskill.dev/api/tools/redirect-map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const routes: Record<
  string,
  { status: number; location?: string; body?: string }
> = {
  'http://old.example.com/about': {
    status: 301,
    location: 'https://old.example.com/about',
  },
  'https://old.example.com/about': {
    status: 301,
    location: 'https://example.com/about',
  },
  'https://example.com/about': { status: 200, body: '<title>About</title>' },
  'https://old.example.com/team': {
    status: 302,
    location: 'https://example.com/team',
  },
  'https://example.com/team': {
    status: 200,
    body: '<meta name="robots" content="noindex">',
  },
  'https://old.example.com/services': {
    status: 301,
    location: 'https://example.com/',
  },
  'https://example.com/': { status: 200, body: '<title>Home</title>' },
  'https://old.example.com/gone': { status: 404 },
}

async function fetcher(input: RequestInfo | URL) {
  const route = routes[input.toString()]
  if (!route) return new Response('missing', { status: 404 })
  return new Response(route.body ?? '', {
    status: route.status,
    headers: {
      'content-type': 'text/html',
      ...(route.location ? { location: route.location } : {}),
    },
  })
}

test('streams one result per row with the verdict, hops and landing page facts', async () => {
  const response = await handleRedirectMap(
    request({
      rows: [
        {
          from: 'http://old.example.com/about',
          to: 'https://example.com/about',
        },
        {
          from: 'https://old.example.com/team',
          to: 'https://example.com/team',
        },
        {
          from: 'https://old.example.com/services',
          to: 'https://example.com/services',
        },
        {
          from: 'https://old.example.com/gone',
          to: 'https://example.com/gone',
        },
      ],
    }),
    fetcher,
  )
  assert.equal(response.status, 200)
  const lines = (await response.text())
    .trim()
    .split('\n')
    .map(
      (line) => JSON.parse(line) as RedirectMapRowResult | RedirectMapSummary,
    )
  const rows = lines
    .filter((line): line is RedirectMapRowResult => line.type === 'row')
    .sort((a, b) => a.index - b.index)
  const summary = lines.at(-1) as RedirectMapSummary
  assert.equal(summary.type, 'summary')
  assert.equal(summary.rows, 4)

  assert.equal(rows[0]?.verdict, 'chain')
  assert.deepEqual(
    rows[0]?.hops.map((hop) => hop.status),
    [301, 301, 200],
  )
  assert.equal(rows[1]?.verdict, 'matches')
  assert.equal(rows[1]?.temporary, true)
  assert.equal(rows[1]?.noindex, true)
  assert.equal(rows[2]?.verdict, 'wrong_target')
  assert.equal(rows[2]?.homepage, true)
  assert.equal(rows[3]?.verdict, 'not_redirected')
  assert.equal(rows[3]?.finalStatus, 404)
})

test('refuses a map over the row limit before fetching anything', async () => {
  let fetches = 0
  const rows = Array.from(
    { length: REDIRECT_MAP_LIMITS.rows + 1 },
    (_, index) => ({
      from: `https://example.com/${index}`,
    }),
  )
  const response = await handleRedirectMap(request({ rows }), async () => {
    fetches += 1
    return new Response('')
  })
  assert.equal(response.status, 413)
  assert.equal(fetches, 0)
})
