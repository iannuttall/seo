import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clusterQueryRows, type QueryClusterRow } from './query-cluster.js'
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

function row(query: string): QueryClusterRow {
  return {
    query,
    impressions: 100,
    clicks: 0,
    position: 10,
    tokens: tokenize(query),
    pages: [
      {
        url: `https://example.com/${query.replace(/[^a-z0-9]+/gi, '-')}`,
        impressions: 100,
        clicks: 0,
      },
    ],
  }
}
