import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withDomainRating } from './domain-rating.js'

const store = new Map<string, Response>()
Object.assign(globalThis, {
  caches: {
    default: {
      match: async (request: Request) => store.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => {
        store.set(request.url, response)
      },
    },
  },
})

test('adds domain_rating after the domain column, one call per domain', async () => {
  const calls: string[] = []
  globalThis.fetch = (async (input: string) => {
    const target = new URL(input).searchParams.get('target') ?? ''
    calls.push(target)
    return Response.json({
      domain_rating: { domain_rating: target === 'a.com' ? 50 : null },
    })
  }) as typeof fetch

  const rows = [
    { keyword: 'x', domain: 'www.a.com', position: 1 },
    { keyword: 'y', domain: 'a.com', position: 2 },
    { keyword: 'z', domain: 'b.com', position: 3 },
  ]
  const out = await withDomainRating(rows, 'key')
  assert.equal(out.added, true)
  assert.deepEqual(Object.keys(out.rows[0] ?? {}), [
    'keyword',
    'domain',
    'domain_rating',
    'position',
  ])
  assert.deepEqual(
    out.rows.map((row) => row.domain_rating),
    [50, 50, null],
  )
  assert.deepEqual(calls.sort(), ['a.com', 'b.com'])

  // A second run reads the cache.
  await withDomainRating(rows, 'key')
  assert.equal(calls.length, 2)
})
