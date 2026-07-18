import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeQueryClustersFromRows,
  clusterQueryRows,
  type QueryClusterRow,
} from './query-cluster.js'
import { tokenize } from './shared.js'

test('clusterQueryRows groups related query variants', () => {
  const clusters = clusterQueryRows([
    row('how to export bookmarks 2026'),
    row('export bookmarks 2026'),
    row('export bookmarks guide 2026'),
    row('feedly alternative'),
  ])

  const exportCluster = clusters.find((cluster) =>
    cluster.some((item) => item.query === 'how to export bookmarks 2026'),
  )
  assert.equal(exportCluster?.length, 3)
  assert.equal(
    clusters.some((cluster) => cluster.length === 1),
    true,
  )
})

test('clusterQueryRows ignores huge common-token buckets but keeps rare overlap', () => {
  const noisyRows = Array.from({ length: 300 }, (_, index) =>
    row(`salary noise ${index}`),
  )
  const clusters = clusterQueryRows([
    ...noisyRows,
    row('average teacher salary france'),
    row('teacher salary france pay'),
  ])

  const teacherCluster = clusters.find((cluster) =>
    cluster.some((item) => item.query === 'average teacher salary france'),
  )
  assert.equal(teacherCluster?.length, 2)
  assert.equal(
    clusters.some((cluster) => cluster.length > 20),
    false,
    'common salary token should not create one huge cluster',
  )
})

test('clusterQueryRows ignores generic intent tokens', () => {
  const clusters = clusterQueryRows([
    row('how to bake'),
    row('how to swim'),
    row('how to bake bread'),
    row('bake bread guide'),
  ])

  assert.equal(
    clusters.some(
      (cluster) =>
        cluster.some((item) => item.query === 'how to bake') &&
        cluster.some((item) => item.query === 'how to swim'),
    ),
    false,
  )
  assert.equal(
    clusters.some(
      (cluster) =>
        cluster.some((item) => item.query === 'how to bake bread') &&
        cluster.some((item) => item.query === 'bake bread guide'),
    ),
    true,
  )
})

test('query cluster intent uses whole tokens instead of substrings', () => {
  const intentFor = (query: string) =>
    analyzeQueryClustersFromRows({ rows: [row(query)], minImpressions: 1 })
      .clusters[0]?.intent

  assert.equal(intentFor('laptop stand'), 'mixed')
  assert.equal(intentFor('show examples'), 'mixed')
  assert.equal(intentFor('best laptop stand'), 'commercial')
  assert.equal(intentFor('how to bake bread'), 'informational')
})

test('query cluster analysis is stable across input permutations', () => {
  const rows = [
    row('technical seo audit', { impressions: 400, url: '/audit' }),
    row('technical seo checklist', { impressions: 400, url: '/checklist' }),
    row('feed reader alternative', { impressions: 100, url: '/feed-reader' }),
  ]

  const forward = analyzeQueryClustersFromRows({ rows })
  const reversed = analyzeQueryClustersFromRows({ rows: [...rows].reverse() })

  assert.deepEqual(reversed, forward)
})

test('query clusters use leave-group-out CTR benchmarks with provenance', () => {
  const clusterRows = [
    row('technical seo audit', {
      clicks: 0,
      impressions: 1000,
      position: 8,
      url: '/audit',
    }),
    row('technical seo audits', {
      clicks: 0,
      impressions: 1000,
      position: 8,
      url: '/audits',
    }),
  ]
  const peerRows = [20, 25, 30, 35, 40].map((clicks, index) =>
    row(`distinct peer topic ${index}`, {
      clicks,
      impressions: 1000,
      position: 8,
      url: `/peer-${index}`,
    }),
  )
  const result = analyzeQueryClustersFromRows({
    rows: [...clusterRows, ...peerRows],
  })
  const cluster = result.clusters.find((item) =>
    item.queries.some((item) => item.query === 'technical seo audit'),
  )

  assert.equal(cluster?.benchmark?.source.includes('leave_group_out'), true)
  assert.equal(cluster?.benchmark?.peerRows, 5)
  assert.equal((cluster?.estimatedClickLift ?? 0) > 0, true)
  assert.equal(cluster?.opportunityScore, cluster?.estimatedClickLift)
})

test('query clusters omit weak singletons and cap output', () => {
  const result = analyzeQueryClustersFromRows({
    rows: [
      row('small standalone query', { impressions: 50 }),
      row('related demand guide', { impressions: 25 }),
      row('related demand tutorial', { impressions: 25 }),
      row('large standalone query', { impressions: 100 }),
    ],
    limit: 1,
  })

  assert.equal(result.clusters.length, 1)
  assert.equal(result.limit, 1)
  assert.equal(
    result.clusters.some(
      (cluster) => cluster.label === 'small standalone query',
    ),
    false,
  )
})

test('query cluster limits normalize unsafe runtime values', () => {
  const fallback = analyzeQueryClustersFromRows({
    rows: [],
    minImpressions: Number.NaN,
    limit: Number.NaN,
  })
  const capped = analyzeQueryClustersFromRows({ rows: [], limit: 1000.8 })

  assert.equal(fallback.minImpressions, 25)
  assert.equal(fallback.limit, 25)
  assert.equal(capped.limit, 100)
})

test('page-two query clusters do not claim CTR-only click lift', () => {
  const result = analyzeQueryClustersFromRows({
    rows: [
      row('technical seo audit', { position: 12 }),
      row('technical seo audits', { position: 13 }),
    ],
  })

  assert.equal(result.clusters[0]?.estimatedClickLift, undefined)
  assert.equal((result.clusters[0]?.opportunityScore ?? 0) > 0, true)
})

test('query cluster summaries inflect singular counts', () => {
  const result = analyzeQueryClustersFromRows({
    rows: [
      row('single result guide', { clicks: 1, impressions: 50 }),
      row('single result tutorial', { clicks: 0, impressions: 50 }),
    ],
    minImpressions: 1,
  })

  assert.equal(
    result.clusters[0]?.summary,
    '2 queries, 100 impressions, 1 click, average position 10.0.',
  )
})

function row(
  query: string,
  input: {
    impressions?: number
    clicks?: number
    position?: number
    url?: string
  } = {},
): QueryClusterRow {
  const impressions = input.impressions ?? 100
  const clicks = input.clicks ?? 0
  return {
    query,
    impressions,
    clicks,
    position: input.position ?? 10,
    tokens: tokenize(query),
    pages: [
      {
        url: `https://example.com${input.url ?? `/${query.replace(/[^a-z0-9]+/gi, '-')}`}`,
        impressions,
        clicks,
      },
    ],
  }
}
