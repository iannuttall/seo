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

test('Bing client validates query and page top-list rows', async () => {
  const api = client({
    GetQueryStats: [
      {
        Date: '2026-07-10T00:00:00Z',
        Query: ' useful query ',
        Clicks: 3,
        Impressions: 40,
        AvgClickPosition: 4.5,
        AvgImpressionPosition: 6.5,
      },
      {
        Date: '2026-07-10T00:00:00Z',
        Query: '',
        Clicks: 1,
        Impressions: 2,
      },
      {
        Date: '2026-07-10T00:00:00Z',
        Query: 'provider sentinel',
        Clicks: 1,
        Impressions: 2,
        AvgClickPosition: -1,
        AvgImpressionPosition: 4,
      },
      {
        Date: '2026-07-10T00:00:00Z',
        Query: 'invalid negative',
        Clicks: 1,
        Impressions: 2,
        AvgClickPosition: -2,
      },
    ],
    GetPageStats: [
      {
        Date: '2026-07-10T00:00:00Z',
        Query: 'https://example.com/page',
        Clicks: 5,
        Impressions: 50,
        AvgImpressionPosition: 8,
      },
      {
        Date: '2026-07-10T00:00:00Z',
        Query: 'not-a-url',
        Clicks: 1,
        Impressions: 2,
      },
    ],
  })
  assert.deepEqual(await api.getQueryStats('https://example.com/'), {
    rows: [
      {
        date: '2026-07-10',
        value: 'provider sentinel',
        clicks: 1,
        impressions: 2,
        avgClickPosition: undefined,
        avgImpressionPosition: 4,
      },
      {
        date: '2026-07-10',
        value: 'useful query',
        clicks: 3,
        impressions: 40,
        avgClickPosition: 4.5,
        avgImpressionPosition: 6.5,
      },
    ],
    invalidRows: 2,
    capped: false,
    returnedRows: 2,
  })
  assert.deepEqual((await api.getPageStats('https://example.com/')).rows, [
    {
      date: '2026-07-10',
      value: 'https://example.com/page',
      clicks: 5,
      impressions: 50,
      avgClickPosition: undefined,
      avgImpressionPosition: 8,
    },
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

test('Bing client rejects oversized provider responses before parsing rows', async () => {
  const api = new BingWebmasterClient(
    { apiKey: 'secret-key' },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ d: 'x'.repeat(2_100_000) }), {
          headers: { 'content-type': 'application/json' },
        }),
    },
  )
  await assert.rejects(
    () => api.getQueryStats('https://example.com/'),
    /exceeds the 2000000-byte response limit/i,
  )
})

test('Bing client normalizes link count and referring URL pages', async () => {
  const api = client({
    GetLinkCounts: {
      Links: [
        { Url: 'https://example.com/a', Count: 12 },
        { Url: 123, Count: 2 },
      ],
      TotalPages: 3,
    },
    GetUrlLinks: {
      Details: [
        { Url: 'https://source.example/a', AnchorText: ' Example ' },
        { Url: false },
      ],
      TotalPages: 2,
    },
  })
  assert.deepEqual(await api.getLinkCounts('https://example.com/', 0), {
    rows: [{ url: 'https://example.com/a', count: 12 }],
    totalPages: 3,
    invalidRows: 1,
    capped: false,
    returnedRows: 1,
  })
  assert.deepEqual(
    await api.getUrlLinks('https://example.com/', 'https://example.com/a', 0),
    {
      rows: [{ url: 'https://source.example/a', anchorText: 'Example' }],
      totalPages: 2,
      invalidRows: 1,
      capped: false,
      returnedRows: 1,
    },
  )
})
