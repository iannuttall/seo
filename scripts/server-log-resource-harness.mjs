import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MEBIBYTE = 1024 * 1024
const ROWS = 250_000
const UNIQUE_CRAWLER_PATHS = 50_000
const MAX_DURATION_MS = 15_000
const MAX_RSS_GROWTH = 256 * MEBIBYTE
const MAX_REPORT_BYTES = MEBIBYTE

const root = await mkdtemp(join(tmpdir(), 'seo-server-log-resource-'))
const file = join(root, 'access.log')

try {
  const output = createWriteStream(file, { encoding: 'utf8' })
  for (let index = 0; index < ROWS; index += 1) {
    const crawler = index % 5 === 0 ? 'GPTBot/1.2' : 'Googlebot/2.1'
    const status = index % 97 === 0 ? 500 : index % 23 === 0 ? 404 : 200
    const line = `127.0.0.1 - - [10/Oct/2025:13:55:36 +0000] "GET /page-${index % UNIQUE_CRAWLER_PATHS} HTTP/1.1" ${status} 1024 "-" "${crawler}"\n`
    if (!output.write(line)) await once(output, 'drain')
  }
  output.end()
  await once(output, 'finish')

  const { importServerLog, renderServerLogCsv, serverLogReport } = await import(
    '../dist/index.js'
  )
  const fileBytes = (await stat(file)).size
  const baselineRss = process.memoryUsage().rss
  let peakRss = baselineRss
  const memorySample = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
  }, 10)
  const startedAt = performance.now()
  const evidence = await importServerLog({ file })
  const durationMs = performance.now() - startedAt
  clearInterval(memorySample)
  peakRss = Math.max(peakRss, process.memoryUsage().rss)

  const report = serverLogReport({ evidence, limit: 200 })
  const csv = renderServerLogCsv(evidence, 'crawler-paths')
  const reportBytes = Buffer.byteLength(JSON.stringify(report))
  const rssGrowthBytes = Math.max(0, peakRss - baselineRss)

  console.log(
    JSON.stringify({
      report: 'server-log-analysis',
      sourceRows: ROWS,
      trackedCrawlerPaths: evidence.crawlerPaths.length,
      durationMs: Math.round(durationMs),
      peakRssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
      bytesRead: evidence.provenance.file.bytesRead,
      bytesWritten: 0,
      reportBytes,
      csvBytes: csv.bytes,
      csvRows: csv.rowsReturned,
    }),
  )

  assert.equal(evidence.summary.suppliedRows, ROWS)
  assert.equal(evidence.provenance.file.bytesRead, fileBytes)
  assert.equal(evidence.provenance.coverage.fileReadCompletely, true)
  assert.equal(evidence.provenance.coverage.pathsCapped, true)
  assert.equal(evidence.crawlerPaths.length, 25_000)
  assert.equal(csv.rowsReturned, 25_000)
  assert.ok(durationMs <= MAX_DURATION_MS)
  assert.ok(rssGrowthBytes <= MAX_RSS_GROWTH)
  assert.ok(reportBytes <= MAX_REPORT_BYTES)
  assert.ok(csv.bytes <= 5_000_000)
} finally {
  await rm(root, { recursive: true, force: true })
}
