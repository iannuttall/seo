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
        const d = (() => {
          if (method === 'GetRankAndTrafficStats') {
            return [
              {
                Date: '2026-07-17T00:00:00Z',
                Clicks: 3,
                Impressions: 30,
              },
            ]
          }
          if (method === 'GetCrawlStats') {
            return [
              {
                Date: '2026-07-17T00:00:00Z',
                CrawledPages: 20,
                InIndex: 15,
              },
            ]
          }
          return [
            {
              Date: '2026-07-17T00:00:00Z',
              Query:
                method === 'GetPageStats'
                  ? 'https://example.com/page'
                  : 'example query',
              Clicks: 2,
              Impressions: 20,
              AvgImpressionPosition: 8,
            },
          ]
        })()
        return new Response(JSON.stringify({ d }))
      },
    },
  )
  const report = await bingWebmasterOverview({
    site: 'https://example.com/',
    client,
  })
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.schemaVersion, 2)
  assert.equal(report.provenance.authentication, 'oauth')
  assert.equal(report.traffic.status, 'complete')
  assert.equal(report.traffic.data.clicks, 3)
  assert.equal(report.traffic.data.outputSelection.returnedRows, 1)
  assert.equal(report.crawl.status, 'complete')
  assert.equal(report.queries.status, 'partial')
  assert.equal(report.queries.data.analysis?.opportunities.length, 1)
  assert.equal(report.pages.status, 'partial')
  assert.equal(report.pages.data.analysis?.opportunities.length, 1)
  assert.equal('rows' in report.queries.data, false)
  assert.equal(report.outputBudget.maxDailyRowsTotal, 28)
})

test('Bing overview preserves one failed section as partial evidence', async () => {
  const client = new BingWebmasterClient(
    { apiKey: 'key' },
    {
      fetchImpl: async (url) =>
        new Response(
          JSON.stringify({
            d: (() => {
              const method = new URL(url).pathname.split('/').at(-1)
              if (method === 'GetCrawlStats') {
                return [{ Date: '2026-07-17T00:00:00Z', CrawledPages: 20 }]
              }
              if (method === 'GetPageStats') {
                return [
                  {
                    Date: '2026-07-17T00:00:00Z',
                    Query: 'https://example.com/page',
                    Clicks: 1,
                    Impressions: 5,
                  },
                ]
              }
              return undefined
            })(),
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
  assert.equal(report.queries.status, 'unavailable')
  assert.equal(report.pages.status, 'partial')
})

test('Bing overview turns material crawl changes into verification-led findings', async () => {
  const client = new BingWebmasterClient(
    { apiKey: 'key' },
    {
      fetchImpl: async (url) => {
        const method = new URL(url).pathname.split('/').at(-1)
        const d =
          method === 'GetCrawlStats'
            ? [
                {
                  Date: '2026-06-19T00:00:00Z',
                  CrawlErrors: 5,
                  Code4xx: 3,
                  Code5xx: 0,
                },
                {
                  Date: '2026-07-17T00:00:00Z',
                  CrawlErrors: 25,
                  Code4xx: 20,
                  Code5xx: 2,
                },
              ]
            : []
        return new Response(JSON.stringify({ d }))
      },
    },
  )
  const report = await bingWebmasterOverview({
    site: 'https://example.com/',
    client,
  })
  assert.deepEqual(
    report.findings.map((finding) => finding.code),
    ['bing_crawl_errors_increased', 'bing_4xx_increased', 'bing_5xx_increased'],
  )
  assert.match(report.findings[0]?.verification ?? '', /sitemap health/)
})

test('Bing overview surfaces material impression movement when clicks stay flat', async () => {
  const start = Date.parse('2026-05-23T00:00:00Z')
  const traffic = Array.from({ length: 56 }, (_, index) => ({
    Date: new Date(start + index * 86_400_000).toISOString(),
    Clicks: 10,
    Impressions: index < 28 ? 100 : 80,
  }))
  const client = new BingWebmasterClient(
    { apiKey: 'key' },
    {
      fetchImpl: async (url) => {
        const method = new URL(url).pathname.split('/').at(-1)
        return new Response(
          JSON.stringify({
            d: method === 'GetRankAndTrafficStats' ? traffic : [],
          }),
        )
      },
    },
  )
  const report = await bingWebmasterOverview({
    site: 'https://example.com/',
    client,
  })
  assert.equal(report.findings[0]?.code, 'bing_impressions_declined')
  assert.equal(report.findings[0]?.evidence.impressionsPercentChange, -20)
  assert.equal(report.findings[0]?.evidence.currentClicks, 280)
})
