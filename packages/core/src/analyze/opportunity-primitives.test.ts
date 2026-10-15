import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCtrBenchmarkContext } from '../index.js'

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

test('CTR aggregate benchmarks use indexed exclusions instead of rescanning source rows', () => {
  const rows = Array.from({ length: 20_000 }, (_, index) =>
    row({
      query: `large aggregate query ${index}`,
      url: `https://example.com/page-${index % 2_000}`,
      clicks: index % 7,
      impressions: 100,
      position: 4 + (index % 7),
    }),
  )
  const context = createCtrBenchmarkContext(rows)

  for (const candidate of rows.slice(0, 1_000)) {
    context.forAggregate(candidate, [candidate])
  }

  assert.deepEqual(context.diagnostics, {
    indexRowVisits: rows.length,
    urlLookups: 0,
    fallbackRowScans: 0,
  })
})
