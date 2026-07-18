import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { BingWebmasterClient } from './client.js'

function client(responses: Record<string, unknown>) {
  return new BingWebmasterClient(
    { apiKey: 'secret-key' },
    {
      fetchImpl: async (url) => {
        const parsed = new URL(url)
        const method = parsed.pathname.split('/').at(-1) ?? ''
        assert.equal(parsed.searchParams.get('apikey'), 'secret-key')
        return new Response(JSON.stringify({ d: responses[method] }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  )
}

test('Bing client validates and sorts verified site evidence', async () => {
  const result = await client({
    GetUserSites: [
      { Url: 'https://z.example/', IsVerified: false },
      { Url: 'https://a.example/', IsVerified: true },
      { Url: 123, IsVerified: true },
    ],
  }).listSites()
  assert.deepEqual(result, {
    sites: [
      { url: 'https://a.example/', isVerified: true },
      { url: 'https://z.example/', isVerified: false },
    ],
    invalidRows: 1,
  })
})

test('Bing client normalizes traffic and crawl dates with invalid-row provenance', async () => {
  const api = client({
    GetRankAndTrafficStats: [
      { Date: '/Date(1720051200000+0000)/', Clicks: 4, Impressions: 20 },
      { Date: 'bad', Clicks: 2, Impressions: 10 },
    ],
    GetCrawlStats: [
      { Date: '2024-07-05T00:00:00Z', CrawledPages: 12, Code4xx: 2 },
      { Date: '2024-07-04T00:00:00Z', CrawledPages: 10, Code4xx: 1 },
    ],
  })
  assert.deepEqual(await api.getTraffic('https://example.com/'), {
    rows: [{ date: '2024-07-04', clicks: 4, impressions: 20 }],
    invalidRows: 1,
    capped: false,
    returnedRows: 1,
  })
  assert.deepEqual((await api.getCrawlStats('https://example.com/')).rows, [
    { date: '2024-07-04', crawledPages: 10, code4xx: 1 },
    { date: '2024-07-05', crawledPages: 12, code4xx: 2 },
  ])
})

test('Bing client errors never expose the API key', async () => {
  const api = new BingWebmasterClient(
    { apiKey: 'do-not-print' },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ Message: 'InvalidApiKey' }), {
          status: 400,
        }),
    },
  )
  await assert.rejects(
    () => api.listSites(),
    (error: Error) =>
      /providers bing connect/.test(error.message) &&
      !error.message.includes('do-not-print'),
  )
})
