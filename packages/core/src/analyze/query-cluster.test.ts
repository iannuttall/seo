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
