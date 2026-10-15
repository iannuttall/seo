import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BROWSER_SERVER_LOG_LIMITS,
  type ServerLogAnalysisProgress,
} from '@seo/core/server-logs/browser'
import { analyzeServerLogFile } from './server-log-file.ts'

const combinedFixture = fileURLToPath(
  new URL('../../../../fixtures/server-logs/combined.log', import.meta.url),
)
test('browser File streaming reads the whole server log', async () => {
  const bytes = await readFile(combinedFixture)
  const progress: ServerLogAnalysisProgress[] = []
  const result = await analyzeServerLogFile({
    file: new File([bytes], 'combined.log'),
    observedAt: '2025-10-11T00:00:00.000Z',
    onProgress: (value) => progress.push(value),
  })

  assert.equal(result.evidence.provenance.file.path, 'combined.log')
  assert.equal(
    result.evidence.provenance.limits.byteLimit,
    BROWSER_SERVER_LOG_LIMITS.bytes,
  )
  assert.deepEqual(result.evidence.summary, {
    suppliedRows: 8,
    parsedRows: 7,
    invalidRows: 1,
    crawlerRows: 6,
    nonCrawlerRows: 1,
    responseBytes: 1_097,
    firstSeenAt: '2025-10-10T13:55:36.000Z',
    lastSeenAt: '2025-10-10T14:01:36.000Z',
  })
  assert.equal(result.report.summary.crawlerRows, 6)
  assert.deepEqual(
    result.errorPaths.map((row) => row.path),
    ['/api', '/missing'],
  )
  assert.deepEqual(progress.at(-1), {
    bytesRead: bytes.byteLength,
    suppliedRows: 8,
  })
})
