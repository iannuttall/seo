import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compactBingWebmasterOverview } from './provider-tools.js'

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    clicks: index,
    impressions: index * 10,
  }))
}

describe('compactBingWebmasterOverview', () => {
  it('keeps summaries while bounding agent row output', () => {
    const result = compactBingWebmasterOverview({
      schemaVersion: 2,
      site: 'https://example.com/',
      generatedAt: '2026-02-01T00:00:00.000Z',
      dataStatus: 'partial',
      summary: { findings: 0, warnings: 0, reviewItems: 0 },
      findings: [],
      outputBudget: {
        maxFindings: 6,
        maxDailyRowsPerSection: 14,
        maxDailyRowsTotal: 28,
        maxDimensionItemsPerList: 10,
        maxDimensionItemsTotal: 40,
      },
      provenance: {
        provider: 'bing-webmaster',
        authentication: 'api-key',
        credentialSource: 'environment',
        observedAt: '2026-02-01T00:00:00.000Z',
        cached: false,
        rowLimits: {
          traffic: 400,
          crawl: 400,
          queries: 8_000,
          pages: 8_000,
        },
        methods: [
          'GetRankAndTrafficStats',
          'GetCrawlStats',
          'GetQueryStats',
          'GetPageStats',
        ],
      },
      traffic: {
        status: 'complete',
        data: {
          rows: rows(40),
          invalidRows: 2,
          capped: false,
          returnedRows: 40,
          retainedRows: 40,
          outputSelection: {
            strategy: 'most-recent',
            availableRows: 40,
            returnedRows: 40,
            omittedRows: 0,
          },
          range: { startDate: '2026-01-01', endDate: '2026-02-09' },
          clicks: 780,
          impressions: 7_800,
          analysis: undefined,
        },
      },
      crawl: {
        status: 'complete',
        data: {
          rows: rows(18).map(({ date }, index) => ({
            date,
            crawledPages: index,
          })),
          invalidRows: 0,
          capped: false,
          returnedRows: 18,
          retainedRows: 18,
          outputSelection: {
            strategy: 'most-recent',
            availableRows: 18,
            returnedRows: 18,
            omittedRows: 0,
          },
          range: { startDate: '2026-01-01', endDate: '2026-01-18' },
          latest: { date: '2026-01-18', crawledPages: 17 },
          analysis: undefined,
        },
      },
      queries: {
        status: 'partial',
        warning: 'Weekly top-list evidence.',
        data: {
          returnedRows: 100,
          retainedRows: 100,
          invalidRows: 0,
          capped: false,
          range: { startDate: '2026-01-01', endDate: '2026-01-31' },
          analysis: undefined,
        },
      },
      pages: {
        status: 'partial',
        warning: 'Weekly top-list evidence.',
        data: {
          returnedRows: 100,
          retainedRows: 100,
          invalidRows: 0,
          capped: false,
          range: { startDate: '2026-01-01', endDate: '2026-01-31' },
          analysis: undefined,
        },
      },
      caveats: ['Provider evidence only.'],
    })

    if (
      result.traffic.status === 'unavailable' ||
      result.crawl.status === 'unavailable'
    ) {
      assert.fail('Expected complete provider sections')
    }
    assert.equal(result.traffic.data.rows.length, 14)
    assert.equal(result.traffic.data.rows[0]?.date, '2026-01-27')
    assert.equal(result.traffic.data.clicks, 780)
    assert.deepEqual(result.traffic.data.outputSelection, {
      strategy: 'most-recent',
      availableRows: 40,
      returnedRows: 14,
      omittedRows: 26,
    })
    assert.equal(result.crawl.data.rows.length, 14)
    assert.equal(result.crawl.data.latest?.date, '2026-01-18')
    assert.equal(result.outputBudget.maxDailyRowsPerSection, 14)
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 20_000)
  })

  it('preserves unavailable sections', () => {
    const result = compactBingWebmasterOverview({
      schemaVersion: 2,
      site: 'https://example.com/',
      generatedAt: '2026-02-01T00:00:00.000Z',
      dataStatus: 'unavailable',
      summary: { findings: 0, warnings: 0, reviewItems: 0 },
      findings: [],
      outputBudget: {
        maxFindings: 6,
        maxDailyRowsPerSection: 14,
        maxDailyRowsTotal: 28,
        maxDimensionItemsPerList: 10,
        maxDimensionItemsTotal: 40,
      },
      provenance: {
        provider: 'bing-webmaster',
        authentication: 'api-key',
        credentialSource: 'file',
        observedAt: '2026-02-01T00:00:00.000Z',
        cached: false,
        rowLimits: {
          traffic: 400,
          crawl: 400,
          queries: 8_000,
          pages: 8_000,
        },
        methods: [
          'GetRankAndTrafficStats',
          'GetCrawlStats',
          'GetQueryStats',
          'GetPageStats',
        ],
      },
      traffic: { status: 'unavailable', warning: 'No traffic data.' },
      crawl: { status: 'unavailable', warning: 'No crawl data.' },
      queries: { status: 'unavailable', warning: 'No query data.' },
      pages: { status: 'unavailable', warning: 'No page data.' },
      caveats: [],
    })

    assert.deepEqual(result.traffic, {
      status: 'unavailable',
      warning: 'No traffic data.',
    })
    assert.deepEqual(result.crawl, {
      status: 'unavailable',
      warning: 'No crawl data.',
    })
  })
})
