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

test('CTR analysis uses site peers without benchmarking a row against itself', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const peers = [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 9,
    }),
  )

  const result = analyzeCtrUnderperformersFromRows({
    rows: [candidate, ...peers],
    site: 'sc-domain:example.com',
  })

  const item = result.items.find(
    (underperformer) => underperformer.query === candidate.keys[0],
  )
  assert.ok(item)
  assert.equal(item.expectedCtr, 0.018)
  assert.equal(item.benchmark.source.includes('leave_target_url_out'), true)
  assert.equal(item.benchmark.peerRows, 5)
  assert.equal(item.benchmark.qualifiedPeerImpressions, 5000)
  assert.equal(item.clickShortfall, 180)
})

test('CTR analysis excludes every target URL row from its benchmark', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const samePage = row({
    query: 'seo audit service',
    url: 'https://example.com/audit#details',
    clicks: 900,
    impressions: 1000,
    position: 9,
  })
  const peers = [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 9,
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
  assert.equal(item.expectedCtr, 0.018)
  assert.equal(item.benchmark.peerRows, 5)
  assert.equal(item.benchmark.peerImpressions, 5000)
})

test('CTR analysis keeps brand and junk rows out of the peer benchmark', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const peers = [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 9,
    }),
  )
  const excludedPeers = [
    ...Array.from({ length: 5 }, (_, index) =>
      row({
        query: `example branded ${index}`,
        url: `https://example.com/brand-${index}`,
        clicks: 900,
        impressions: 1000,
        position: 9,
      }),
    ),
    row({
      query: 'site:example.com',
      url: 'https://example.com/operator',
      clicks: 900,
      impressions: 1000,
      position: 9,
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
  assert.equal(item.expectedCtr, 0.018)
  assert.equal(item.benchmark.peerRows, 5)
})

test('qualified rows below the reporting threshold still inform benchmarks', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const peers = Array.from({ length: 10 }, (_, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks: index < 5 ? 2 : 1,
      impressions: 100,
      position: 9,
    }),
  )

  const result = analyzeCtrUnderperformersFromRows({
    rows: [candidate, ...peers],
    site: 'sc-domain:example.com',
    minImpressions: 200,
  })

  assert.equal(result.items.length, 1)
  assert.equal(
    result.items[0]?.benchmark.source.includes('site_gsc_position_bucket'),
    true,
  )
  assert.equal(result.items[0]?.benchmark.qualifiedPeerImpressions, 1000)
})

test('CTR analysis breaks complete ties by query and URL', () => {
  const result = analyzeCtrUnderperformersFromRows({
    rows: [
      row({
        query: 'beta query',
        url: 'https://example.com/b',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'alpha query',
        url: 'https://example.com/z',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'alpha query',
        url: 'https://example.com/a',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
    ],
    site: 'sc-domain:example.com',
  })

  assert.deepEqual(
    result.items.map((item) => [item.query, item.url]),
    [
      ['alpha query', 'https://example.com/a'],
      ['alpha query', 'https://example.com/z'],
      ['beta query', 'https://example.com/b'],
    ],
  )
})

test('CTR analysis excludes brand, junk, and low-impression candidates', () => {
  const result = analyzeCtrUnderperformersFromRows({
    rows: [
      row({
        query: 'example login',
        url: 'https://example.com/login',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'site:example.com',
        url: 'https://example.com/',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'technical seo audit',
        url: 'https://example.com/audit',
        clicks: 0,
        impressions: 199,
        position: 5,
      }),
    ],
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
  })

  assert.deepEqual(result.items, [])
})

test('aggregates repeated query/page rows before CTR and position analysis', () => {
  const rows = [
    row({
      query: 'Technical SEO Audit',
      url: 'https://example.com/audit',
      clicks: 0,
      impressions: 100,
      position: 4,
    }),
    row({
      query: 'technical seo audit',
      url: 'https://example.com/audit#section',
      clicks: 0,
      impressions: 300,
      position: 6,
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
  assert.equal(forward.items[0]?.position, 5.5)
})

test('keeps zero clicks while excluding invalid rows with stable provenance', () => {
  const zeroClick = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 1000,
    position: 5,
  })
  const invalidRows: GscRow[] = [
    { ...zeroClick, keys: ['missing page'] },
    { ...zeroClick, keys: ['bad url', 'not-a-url'] },
    { ...zeroClick, clicks: 1001 },
    { ...zeroClick, ctr: Number.NaN },
    { ...zeroClick, position: 0 },
  ]
  const result = analyzeCtrUnderperformersFromRows({
    rows: [zeroClick, ...invalidRows],
    site: 'sc-domain:example.com',
  })

  assert.equal(result.selection.sourceRows, 6)
  assert.equal(result.selection.invalidRows, 5)
  assert.equal(result.selection.validRows, 1)
  assert.equal(result.items[0]?.clicks, 0)
  assert.equal(result.items[0]?.actualCtr, 0)
})

test('bounds pure-analysis options and limits after ranking all candidates', () => {
  const rows = ['charlie', 'alpha', 'bravo'].map((query) =>
    row({
      query,
      url: `https://example.com/${query}`,
      clicks: 0,
      impressions: 1000,
      position: 5,
    }),
  )
  const result = analyzeCtrUnderperformersFromRows({
    rows,
    site: 'sc-domain:example.com',
    minImpressions: -10,
    limit: 1,
  })

  assert.equal(result.minImpressions, 1)
  assert.equal(result.limit, 1)
  assert.equal(result.selection.eligibleUnderperformers, 3)
  assert.equal(result.selection.returnedUnderperformers, 1)
  assert.equal(result.selection.limitedUnderperformers, 2)
  assert.equal(result.items[0]?.query, 'alpha')
  assert.equal(result.totalClickShortfall, 150)
  assert.equal(result.returnedClickShortfall, 50)
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
            position: 5,
          }),
          {
            ...row({
              query: 'bad row',
              url: 'https://example.com/bad',
              clicks: 0,
              impressions: 1000,
              position: 5,
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
  assert.match(report.caveats.join('\n'), /invalid provider row/)
  assert.doesNotMatch(report.summary.verdict, /clicks available/)
  assert.doesNotMatch(
    report.items[0]?.recommendation.evidenceRef ?? '',
    /on the table/,
  )
  assert.match(
    report.items[0]?.recommendation.action ?? '',
    /Review the live SERP/,
  )
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
          position: 5,
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
  assert.match(report.summary.verdict, /partial evidence prevents an all-clear/)
})

test('report validates numeric options before calling Search Console', async () => {
  let calls = 0
  await assert.rejects(
    ctrUnderperformersReport(
      { site: 'sc-domain:example.com', minImpressions: 1.5 },
      {
        searchAnalytics: async () => {
          calls++
          return { rows: [], calls: 0, rowsFetched: 0 }
        },
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    /minImpressions must be a whole number/,
  )
  assert.equal(calls, 0)
})
