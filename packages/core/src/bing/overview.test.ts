import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { BingWebmasterClient } from './client.js'
import { bingWebmasterOverview } from './overview.js'

test('Bing overview keeps complete provider evidence bounded and explicit', async () => {
  const client = new BingWebmasterClient(
    { accessToken: 'token' },
    {
      fetchImpl: async (url) => {
        const method = new URL(url).pathname.split('/').at(-1)
        const d =
          method === 'GetRankAndTrafficStats'
            ? [
                {
                  Date: '2026-07-17T00:00:00Z',
                  Clicks: 3,
                  Impressions: 30,
                },
              ]
            : [
                {
                  Date: '2026-07-17T00:00:00Z',
                  CrawledPages: 20,
                  InIndex: 15,
                },
              ]
        return new Response(JSON.stringify({ d }))
      },
    },
  )
  const report = await bingWebmasterOverview({
    site: 'https://example.com/',
    client,
  })
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.provenance.authentication, 'oauth')
  assert.equal(report.traffic.status, 'complete')
  assert.equal(report.traffic.data.clicks, 3)
  assert.equal(report.crawl.status, 'complete')
})

test('Bing overview preserves one failed section as partial evidence', async () => {
  const client = new BingWebmasterClient(
    { apiKey: 'key' },
    {
      fetchImpl: async (url) =>
        new Response(
          JSON.stringify({
            d: new URL(url).pathname.endsWith('GetCrawlStats')
              ? [{ Date: '2026-07-17T00:00:00Z', CrawledPages: 20 }]
              : undefined,
          }),
        ),
    },
  )
  const report = await bingWebmasterOverview({
    site: 'https://example.com/',
    client,
  })
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.traffic.status, 'unavailable')
  assert.equal(report.crawl.status, 'complete')
})
