import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { importServerLog } from '@seo/core'
import {
  BROWSER_SERVER_LOG_LIMITS,
  type ServerLogAnalysisProgress,
} from '@seo/core/server-logs/browser'
import { analyzeServerLogFile } from './server-log-file.ts'

const combinedFixture = fileURLToPath(
  new URL('../../../../fixtures/server-logs/combined.log', import.meta.url),
)
test('browser File streaming matches the Node server-log importer', async () => {
  const bytes = await readFile(combinedFixture)
  const nodeEvidence = await importServerLog({ file: combinedFixture })
  const progress: ServerLogAnalysisProgress[] = []
  const result = await analyzeServerLogFile({
    file: new File([bytes], 'combined.log'),
    observedAt: nodeEvidence.provenance.observedAt,
    onProgress: (value) => progress.push(value),
  })

  const normalizedNode = structuredClone(nodeEvidence)
  normalizedNode.provenance.file.path = 'combined.log'
  normalizedNode.provenance.limits.byteLimit = BROWSER_SERVER_LOG_LIMITS.bytes
  assert.deepEqual(result.evidence, normalizedNode)
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
