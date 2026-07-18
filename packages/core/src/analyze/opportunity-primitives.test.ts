import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createCtrBenchmarkContext,
  queryFieldCoverage,
  unicodeTokens,
} from '../index.js'

function row(input: {
  query: string
  url: string
  clicks: number
  impressions: number
  position: number
}) {
  return {
    keys: [input.query, input.url],
    clicks: input.clicks,
    impressions: input.impressions,
    ctr: input.impressions ? input.clicks / input.impressions : 0,
    position: input.position,
  }
}

test('CTR benchmark excludes the scored row from its peer bucket', () => {
  const candidate = row({
    query: 'flipboard alternative',
    url: 'https://example.com/flipboard',
    clicks: 0,
    impressions: 47_555,
    position: 8.8,
  })
  const peers = [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `feed reader peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 9,
    }),
  )

  const benchmark = createCtrBenchmarkContext([candidate, ...peers]).forRow(
    candidate,
  )

  assert.equal(benchmark.source.includes('leave_one_out'), true)
  assert.equal(benchmark.ctr, 0.018)
  assert.equal(benchmark.rows, 5)
  assert.equal(benchmark.qualifiedImpressions, 5000)
})

test('CTR benchmark excludes grouped rows from aggregate peer buckets', () => {
  const groupedRows = [
    row({
      query: 'technical seo audit',
      url: 'https://example.com/a',
      clicks: 0,
      impressions: 10_000,
      position: 8,
    }),
    row({
      query: 'technical seo checklist',
      url: 'https://example.com/b',
      clicks: 0,
      impressions: 8000,
      position: 8,
    }),
  ]
  const peers = [40, 35, 30, 25, 20].map((clicks, index) =>
    row({
      query: `peer query ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 8,
    }),
  )

  const benchmark = createCtrBenchmarkContext([
    ...groupedRows,
    ...peers,
  ]).forAggregate(
    {
      keys: ['technical seo', 'https://example.com/a'],
      clicks: 0,
      impressions: 18_000,
      ctr: 0,
      position: 8,
    },
    groupedRows,
  )

  assert.equal(benchmark.source.includes('leave_group_out'), true)
  assert.equal(benchmark.ctr, 0.025)
  assert.equal(benchmark.rows, 5)
})

test('CTR benchmark excludes a mixed-position group from every peer bucket', () => {
  const groupedRows = [
    row({
      query: 'technical seo audit',
      url: 'https://example.com/a',
      clicks: 0,
      impressions: 10_000,
      position: 6,
    }),
    row({
      query: 'technical seo checklist',
      url: 'https://example.com/b',
      clicks: 0,
      impressions: 8000,
      position: 8,
    }),
  ]

  const benchmark = createCtrBenchmarkContext(groupedRows).forAggregate(
    {
      keys: ['technical seo', 'https://example.com/a'],
      clicks: 0,
      impressions: 18_000,
      ctr: 0,
      position: 7,
    },
    groupedRows,
  )

  assert.equal(benchmark.ctr, 0.025)
  assert.equal(benchmark.rows, 0)
  assert.equal(benchmark.source.includes('leave_group_out'), false)
})

test('CTR benchmark curve stays monotonic by ranking position', () => {
  const rows = [
    ...[1, 1, 1, 1, 1].map((clicks, index) =>
      row({
        query: `position five ${index}`,
        url: `https://example.com/5-${index}`,
        clicks,
        impressions: 1000,
        position: 5,
      }),
    ),
    ...[100, 100, 100, 100, 100].map((clicks, index) =>
      row({
        query: `position eight ${index}`,
        url: `https://example.com/8-${index}`,
        clicks,
        impressions: 1000,
        position: 8,
      }),
    ),
  ]
  const context = createCtrBenchmarkContext(rows)

  let previous = Number.POSITIVE_INFINITY
  for (const position of Array.from({ length: 10 }, (_, index) => index + 1)) {
    const ctr = context.byPosition[String(position)]?.ctr ?? 0
    assert.equal(ctr <= previous, true)
    previous = ctr
  }
})

test('CTR benchmark floors a zero-heavy site sample', () => {
  const candidate = row({
    query: 'twitter search',
    url: 'https://example.com/twitter',
    clicks: 10,
    impressions: 10_000,
    position: 6,
  })
  const zeroHeavyRows = [
    candidate,
    ...Array.from({ length: 20 }, (_, index) =>
      row({
        query: `zero sample ${index}`,
        url: `https://example.com/zero-${index}`,
        clicks: 0,
        impressions: 1000,
        position: 6,
      }),
    ),
    ...[3, 4, 5].map((clicks, index) =>
      row({
        query: `positive sample ${index}`,
        url: `https://example.com/positive-${index}`,
        clicks,
        impressions: 1000,
        position: 6,
      }),
    ),
  ]

  const benchmark = createCtrBenchmarkContext(zeroHeavyRows).forRow(candidate)

  assert.equal(benchmark.source.includes('floored'), true)
  assert.equal(benchmark.ctr, 0.0175)
})

test('CTR benchmark ignores tiny high-CTR samples', () => {
  const strongCandidate = row({
    query: 'air pasang surut tanjung dawai',
    url: 'https://example.com/tides/tanjung-dawai',
    clicks: 162,
    impressions: 587,
    position: 2.14,
  })
  const tinyNoisyRows = Array.from({ length: 2000 }, (_, index) =>
    row({
      query: `tiny query ${index}`,
      url: `https://example.com/tiny-${index}`,
      clicks: 1,
      impressions: 1,
      position: 2,
    }),
  )
  const qualifiedPeers = [18, 20, 22, 24, 26].map((clicks, index) =>
    row({
      query: `qualified peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 100,
      position: 2,
    }),
  )

  const benchmark = createCtrBenchmarkContext([
    strongCandidate,
    ...tinyNoisyRows,
    ...qualifiedPeers,
  ]).forRow(strongCandidate)

  assert.equal(benchmark.source, 'default_position_curve')
  assert.equal(benchmark.ctr, 0.15)
  assert.equal(benchmark.ctr < strongCandidate.ctr, true)
  assert.equal(benchmark.urlSamples, 5)
})

test('CTR benchmark caps unusually strong site samples', () => {
  const candidate = row({
    query: 'candidate',
    url: 'https://example.com/candidate',
    clicks: 0,
    impressions: 1000,
    position: 8,
  })
  const peers = Array.from({ length: 5 }, (_, index) =>
    row({
      query: `strong peer ${index}`,
      url: `https://example.com/strong-${index}`,
      clicks: 500,
      impressions: 1000,
      position: 8,
    }),
  )

  const benchmark = createCtrBenchmarkContext([candidate, ...peers]).forRow(
    candidate,
  )

  assert.equal(benchmark.source.includes('capped'), true)
  assert.equal(benchmark.ctr, 0.025)
})

test('CTR URL benchmarks use one index pass instead of rescanning source rows', () => {
  const rows = Array.from({ length: 20_000 }, (_, index) =>
    row({
      query: `large property query ${index}`,
      url: `https://example.com/page-${index % 2_000}`,
      clicks: index % 7,
      impressions: 100,
      position: 4 + (index % 7),
    }),
  )
  const context = createCtrBenchmarkContext(rows, {
    samplePopulation: 'all_qualified_url_samples',
  })

  for (const candidate of rows.slice(0, 1_000)) {
    context.forUrl(candidate)
  }

  assert.deepEqual(context.diagnostics, {
    indexRowVisits: rows.length,
    urlLookups: 1_000,
    fallbackRowScans: 0,
  })
})

test('query coverage tokenizes non-Latin queries', () => {
  const query = 'تويتر بحث بدون حساب'
  const coverage = queryFieldCoverage(query, {
    title: 'تويتر بحث بدون حساب',
    meta: 'استخدم تويتر بدون تسجيل دخول',
    h1: 'بحث تويتر',
    opening: 'دليل البحث في تويتر بدون حساب.',
  })

  assert.equal(unicodeTokens(query).length > 0, true)
  assert.equal(coverage.evaluated, true)
  assert.equal(coverage.inTitle, true)
  assert.equal(coverage.inH1, true)
})
