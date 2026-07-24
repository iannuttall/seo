import assert from 'node:assert/strict'
import { Response } from 'undici'
import { z } from 'zod'

const BATCHES = 10
const ROWS_PER_BATCH = 1_000
const MAX_DURATION_MS = 10_000

export async function runAhrefsResourceHarness({ mebibyte }) {
  const { AhrefsClient, clearCache, getCacheStats } = await import(
    '../dist/index.js'
  )
  const maxRssGrowth = 256 * mebibyte
  const maxOutputBytes = 3 * mebibyte
  const schema = z
    .object({
      rows: z
        .array(
          z
            .object({
              keyword: z.string(),
              fixture_payload: z.string(),
            })
            .strict(),
        )
        .max(ROWS_PER_BATCH),
    })
    .strict()
  let limitsCalls = 0
  let reportCalls = 0
  let bytesRead = 0
  const startingCache = getCacheStats()
  const client = new AhrefsClient({
    apiKey: 'resource-test-api-key',
    spendLimits: {
      dailyNoticeMicros: 0,
      dailyHardLimitMicros: null,
      monthlyHardLimitMicros: null,
      maxRequestsPerReport: BATCHES,
      maxRowsPerReport: BATCHES * ROWS_PER_BATCH,
    },
    fetch: async (url) => {
      const requestUrl = new URL(String(url))
      if (requestUrl.pathname.endsWith('/limits-and-usage')) {
        limitsCalls += 1
        const json = JSON.stringify({
          limits_and_usage: {
            api_key_expiration_date: '2027-07-24T00:00:00Z',
            subscription: 'Resource fixture',
            units_limit_api_key: 100_000,
            units_limit_workspace: 100_000,
            units_usage_api_key: reportCalls * ROWS_PER_BATCH,
            units_usage_workspace: reportCalls * ROWS_PER_BATCH,
            usage_reset_date: '2026-08-22T00:00:00Z',
          },
        })
        bytesRead += Buffer.byteLength(json)
        return new Response(json)
      }
      reportCalls += 1
      const json = JSON.stringify({
        rows: Array.from({ length: ROWS_PER_BATCH }, (_, index) => ({
          keyword: `bounded keyword ${reportCalls}-${index}`,
          fixture_payload: 'x'.repeat(2_048),
        })),
      })
      bytesRead += Buffer.byteLength(json)
      return new Response(json, {
        headers: {
          'x-api-rows': String(ROWS_PER_BATCH),
          'x-api-units-cost-row': '1',
          'x-api-units-cost-total': String(ROWS_PER_BATCH),
          'x-api-units-cost-total-actual': String(ROWS_PER_BATCH),
          'x-api-cache': 'miss',
        },
      })
    },
  })
  const request = (batch) => ({
    operation: 'ranked-keywords',
    capability: 'ranked-keywords',
    path: 'site-explorer/organic-keywords',
    query: {
      target: `domain-${batch}.example`,
      limit: ROWS_PER_BATCH,
    },
    schema,
    requestedRows: ROWS_PER_BATCH,
    perRowUnits: 1,
    rowCount: (response) => response.rows.length,
    context: {
      reportId: 'provider-resource-harness',
      reportRunId: 'ahrefs-bounded-run',
    },
  })

  const baselineRss = process.memoryUsage().rss
  const startedAt = performance.now()
  let lastSnapshot
  for (let batch = 0; batch < BATCHES; batch += 1) {
    lastSnapshot = await client.request(request(batch))
  }
  const cached = await client.request(request(0))
  assert.equal(cached.cache.status, 'hit')
  await assert.rejects(
    client.request(request(BATCHES)),
    (error) => error?.code === 'budget-limit',
  )

  const durationMs = performance.now() - startedAt
  const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - baselineRss)
  const outputBytes = Buffer.byteLength(JSON.stringify(lastSnapshot))
  const cacheStats = getCacheStats()
  const cacheBytesWritten = Math.max(
    0,
    cacheStats.logicalSizeBytes - startingCache.logicalSizeBytes,
  )
  const diskBytesWritten = Math.max(
    0,
    cacheStats.sizeBytes - startingCache.sizeBytes,
  )
  console.log(
    JSON.stringify({
      provider: 'ahrefs',
      requestedRows: BATCHES * ROWS_PER_BATCH,
      limitsCalls,
      paidCalls: reportCalls,
      durationMs: Math.round(durationMs),
      rssGrowthMiB: Number((rssGrowthBytes / mebibyte).toFixed(1)),
      bytesRead,
      cacheBytesWritten,
      diskBytesWritten,
      outputBytes,
      estimatedApiUnits: lastSnapshot?.cost.native?.estimatedUnits ?? null,
      actualApiUnits: lastSnapshot?.cost.native?.actualUnits ?? null,
    }),
  )
  assert.equal(reportCalls, BATCHES)
  assert.equal(limitsCalls, BATCHES)
  assert.equal(cacheStats.counts.ahrefs_cache, BATCHES)
  assert.ok(durationMs <= MAX_DURATION_MS)
  assert.ok(rssGrowthBytes <= maxRssGrowth)
  assert.ok(outputBytes <= maxOutputBytes)
  assert.ok(cacheStats.logicalSizeBytes <= cacheStats.maxSizeBytes)
  assert.equal(clearCache('ahrefs'), BATCHES)
  assert.equal(getCacheStats().counts.ahrefs_cache, 0)
}
