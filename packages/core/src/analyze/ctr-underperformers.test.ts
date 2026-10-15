import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SearchAnalyticsRequest } from '../gsc/client.js'
import type { GscRow } from '../types.js'
import {
  analyzeCtrUnderperformersFromRows,
  type CtrUnderperformerDependencies,
  ctrUnderperformersReport,
} from './ctr-underperformers.js'

function row(input: {
  query: string
  url: string
  clicks: number
  impressions: number
  position: number
}): GscRow {
  return {
    keys: [input.query, input.url],
    clicks: input.clicks,
    impressions: input.impressions,
    ctr: input.impressions ? input.clicks / input.impressions : 0,
    position: input.position,
  }
}

test('CTR analysis excludes every target URL row from its benchmark', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 3,
  })
  const samePage = row({
    query: 'seo audit service',
    url: 'https://example.com/audit#details',
    clicks: 900,
    impressions: 1000,
    position: 3,
  })
  const peers = [120, 108, 90, 72, 60].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 3,
    }),
  )

  const result = analyzeCtrUnderperformersFromRows({
    rows: [candidate, samePage, ...peers],
    site: 'sc-domain:example.com',
  })
  const item = result.items.find(
    (underperformer) => underperformer.query === candidate.keys[0],
  )

  assert.ok(item)
  assert.equal(item.expectedCtr, 0.108)
  assert.equal(item.benchmark.peerRows, 5)
  assert.equal(item.benchmark.peerImpressions, 5000)
})

test('CTR analysis keeps brand and junk rows out of the peer benchmark', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 3,
  })
  const peers = [120, 108, 90, 72, 60].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 3,
    }),
  )
  const excludedPeers = [
    ...Array.from({ length: 5 }, (_, index) =>
      row({
        query: `example branded ${index}`,
        url: `https://example.com/brand-${index}`,
        clicks: 900,
        impressions: 1000,
        position: 3,
      }),
    ),
    row({
      query: 'site:example.com',
      url: 'https://example.com/operator',
      clicks: 900,
      impressions: 1000,
      position: 3,
    }),
  ]

  const result = analyzeCtrUnderperformersFromRows({
    rows: [candidate, ...peers, ...excludedPeers],
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
  })

  const item = result.items.find(
    (underperformer) => underperformer.query === candidate.keys[0],
  )
  assert.ok(item)
  assert.equal(item.expectedCtr, 0.108)
  assert.equal(item.benchmark.peerRows, 5)
})

test('aggregates repeated query/page rows before CTR and position analysis', () => {
  const rows = [
    row({
      query: 'Technical SEO Audit',
      url: 'https://example.com/audit',
      clicks: 0,
      impressions: 100,
      position: 2,
    }),
    row({
      query: 'technical seo audit',
      url: 'https://example.com/audit#section',
      clicks: 0,
      impressions: 300,
      position: 3,
    }),
  ]
  const forward = analyzeCtrUnderperformersFromRows({
    rows,
    site: 'sc-domain:example.com',
  })
  const reverse = analyzeCtrUnderperformersFromRows({
    rows: [...rows].reverse(),
    site: 'sc-domain:example.com',
  })

  assert.deepEqual(forward, reverse)
  assert.equal(forward.selection.validRows, 2)
  assert.equal(forward.selection.duplicateRows, 1)
  assert.equal(forward.selection.aggregatedRows, 1)
  assert.equal(forward.items.length, 1)
  assert.equal(forward.items[0]?.query, 'Technical SEO Audit')
  assert.equal(forward.items[0]?.impressions, 400)
  assert.equal(forward.items[0]?.actualCtr, 0)
  assert.equal(forward.items[0]?.position, 2.75)
})

test('report publishes bounded retained-row and validation provenance', async () => {
  const requests: SearchAnalyticsRequest[] = []
  const report = await ctrUnderperformersReport(
    { site: 'sc-domain:example.com' },
    {
      searchAnalytics: async (_site, request) => {
        requests.push(request)
        const rows = [
          row({
            query: 'technical seo audit',
            url: 'https://example.com/audit',
            clicks: 0,
            impressions: 1000,
            position: 3,
          }),
          {
            ...row({
              query: 'bad row',
              url: 'https://example.com/bad',
              clicks: 0,
              impressions: 1000,
              position: 3,
            }),
            ctr: 2,
          },
        ]
        return { rows, calls: 2, rowsFetched: rows.length }
      },
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.deepEqual(report.range, {
    startDate: '2026-06-08',
    endDate: '2026-07-05',
  })
  assert.equal(requests[0]?.maxRows, 100_000)
  assert.deepEqual(requests[0]?.dimensions, ['query', 'page'])
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.completeness, 'partial')
  assert.deepEqual(report.source.validation, {
    retainedRows: 1,
    invalidRows: 1,
    aggregatedRows: 1,
    duplicateRows: 0,
  })
})

test('a retained-row cap cannot produce a definitive CTR all-clear', async () => {
  const dependencies: CtrUnderperformerDependencies = {
    searchAnalytics: async () => ({
      rows: [
        row({
          query: 'healthy query',
          url: 'https://example.com/healthy',
          clicks: 100,
          impressions: 1000,
          position: 3,
        }),
      ],
      calls: 4,
      rowsFetched: 100_000,
    }),
    now: () => new Date('2026-07-09T12:00:00.000Z'),
  }
  const report = await ctrUnderperformersReport(
    { site: 'sc-domain:example.com' },
    dependencies,
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.completeness, 'possibly-truncated')
  assert.equal(report.summary.underperformers, 0)
})

test('a mid-size site gets a scaled default minimum and keeps low-CTR rows', async () => {
  // Regression: a fixed 200-impression default returned no rows for a site
  // with about 150,000 retained impressions, where page-one rows carry 30 to
  // 150 impressions each.
  const candidates = Array.from({ length: 20 }, (_, index) =>
    row({
      query: `widget question ${String(index).padStart(2, '0')}`,
      url: `https://example.com/widgets/${index}`,
      clicks: 0,
      impressions: 30 + index * 6,
      position: 1 + (index % 3),
    }),
  )
  const deeper = Array.from({ length: 300 }, (_, index) =>
    row({
      query: `deep topic ${index}`,
      url: `https://example.com/deep/${index}`,
      clicks: 1,
      impressions: 494,
      position: 25,
    }),
  )
  const rows = [
    ...candidates,
    ...deeper,
    row({
      query: 'deep remainder',
      url: 'https://example.com/deep/remainder',
      clicks: 0,
      impressions: 60,
      position: 30,
    }),
  ]
  const dependencies: CtrUnderperformerDependencies = {
    searchAnalytics: async () => ({ rows, calls: 1, rowsFetched: rows.length }),
    now: () => new Date('2026-07-09T12:00:00.000Z'),
  }

  const report = await ctrUnderperformersReport(
    { site: 'sc-domain:example.com' },
    dependencies,
  )

  assert.deepEqual(report.minImpressionsPolicy, {
    effective: 30,
    source: 'scaled-default',
    basisImpressions: 150_000,
    scale: {
      share: 0.0002,
      floor: 30,
      ceiling: 200,
      basis: 'sum_of_retained_query_page_impressions',
      heuristic: true,
    },
  })
  assert.equal(report.summary.minImpressions, 30)
  assert.equal(report.summary.underperformers, 20)
  assert.equal(report.dataStatus, 'complete')

  const fixed = await ctrUnderperformersReport(
    { site: 'sc-domain:example.com', minImpressions: 200 },
    dependencies,
  )
  assert.equal(fixed.minImpressionsPolicy.source, 'explicit')
  assert.equal(fixed.summary.underperformers, 0)
  assert.equal(fixed.selection.belowMinimumRows, 20)
})
