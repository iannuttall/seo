import assert from 'node:assert/strict'
import { Response } from 'undici'

const BATCHES = 10
const ROWS_PER_BATCH = 1_000
const MAX_DURATION_MS = 10_000

export async function runSemrushResourceHarness({ mebibyte }) {
  const { clearCache, getCacheStats, SemrushClient } = await import(
    '../dist/index.js'
  )
  const maxRssGrowth = 256 * mebibyte
  const maxOutputBytes = mebibyte
  let balanceCalls = 0
  let reportCalls = 0
  let bytesRead = 0
  const client = new SemrushClient({
    apiKey: 'resource-test-api-key',
    fetch: async (url) => {
      const requestUrl = new URL(String(url))
      if (requestUrl.hostname === 'www.semrush.com') {
        balanceCalls += 1
        bytesRead += 6
        return new Response('500000')
      }
      reportCalls += 1
      const domain = requestUrl.searchParams.get('domain')
      const csv = [
        'Keyword;Position;Search Volume;URL',
        ...Array.from(
          { length: ROWS_PER_BATCH },
          (_, index) =>
            `bounded keyword ${reportCalls}-${index};${1 + (index % 100)};${index % 1_000};https://${domain}/pages/${index}`,
        ),
      ].join('\n')
      bytesRead += Buffer.byteLength(csv)
      return new Response(csv)
    },
  })
  const baselineRss = process.memoryUsage().rss
  const startedAt = performance.now()
  let lastSnapshot
  for (let batch = 0; batch < BATCHES; batch += 1) {
    lastSnapshot = await client.report({
      operation: 'ranked-keywords',
      reportType: 'domain_organic',
      parameters: {
        domain: `domain-${batch}.example`,
        database: 'us',
        display_limit: ROWS_PER_BATCH,
      },
      columns: ['Ph', 'Po', 'Nq', 'Ur'],
      maximumResponseRows: ROWS_PER_BATCH,
      unitsPerLine: 10,
    })
  }
  const cached = await client.report({
    operation: 'ranked-keywords',
    reportType: 'domain_organic',
    parameters: {
      domain: 'domain-0.example',
      database: 'us',
      display_limit: ROWS_PER_BATCH,
    },
    columns: ['Ph', 'Po', 'Nq', 'Ur'],
    maximumResponseRows: ROWS_PER_BATCH,
    unitsPerLine: 10,
  })
  const durationMs = performance.now() - startedAt
  const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - baselineRss)
  const outputBytes = Buffer.byteLength(JSON.stringify(lastSnapshot))
  const cacheStats = getCacheStats()
  console.log(
    JSON.stringify({
      provider: 'semrush',
      requestedRows: BATCHES * ROWS_PER_BATCH,
      balanceCalls,
      paidCalls: reportCalls,
      durationMs: Math.round(durationMs),
      rssGrowthMiB: Number((rssGrowthBytes / mebibyte).toFixed(1)),
      bytesRead,
      cacheBytesWritten: cacheStats.logicalSizeBytes,
      diskBytes: cacheStats.sizeBytes,
      outputBytes,
      estimatedApiUnits: lastSnapshot?.cost.native?.estimatedUnits ?? null,
      actualApiUnits: lastSnapshot?.cost.native?.actualUnits ?? null,
    }),
  )
  assert.equal(cached.cache.status, 'hit')
  assert.equal(reportCalls, BATCHES)
  assert.equal(balanceCalls, BATCHES)
  assert.equal(cacheStats.counts.semrush_cache, BATCHES)
  assert.ok(durationMs <= MAX_DURATION_MS)
  assert.ok(rssGrowthBytes <= maxRssGrowth)
  assert.ok(outputBytes <= maxOutputBytes)
  assert.ok(cacheStats.logicalSizeBytes <= cacheStats.maxSizeBytes)
  assert.equal(clearCache('semrush'), BATCHES)
  assert.equal(getCacheStats().counts.semrush_cache, 0)
}
