import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeServerLogChunks, SERVER_LOG_LIMITS } from './analysis.js'

const combinedFixture = fileURLToPath(
  new URL('../../../../fixtures/server-logs/combined.log', import.meta.url),
)

async function* unevenChunks(value: Uint8Array): AsyncGenerator<Uint8Array> {
  const sizes = [1, 2, 7, 31, 257, 4_093]
  let offset = 0
  let index = 0
  while (offset < value.byteLength) {
    const size = sizes[index % sizes.length] ?? 1
    yield value.subarray(offset, Math.min(offset + size, value.byteLength))
    offset += size
    index += 1
  }
}

async function* oneChunk(value: Uint8Array): AsyncGenerator<Uint8Array> {
  yield value
}

test('chunk analysis does not depend on chunk boundaries', async () => {
  const bytes = await readFile(combinedFixture)
  const analyze = (chunks: AsyncGenerator<Uint8Array>) =>
    analyzeServerLogChunks({
      chunks,
      file: { path: combinedFixture, fileBytes: bytes.byteLength },
      format: 'combined',
      rowLimit: SERVER_LOG_LIMITS.defaultRows,
      pathLimit: SERVER_LOG_LIMITS.defaultPaths,
      byteLimit: SERVER_LOG_LIMITS.maximumBytes,
      maxLineBytes: SERVER_LOG_LIMITS.maximumLineBytes,
      observedAt: '2025-10-11T00:00:00.000Z',
    })
  const wholeEvidence = await analyze(oneChunk(bytes))
  const chunkEvidence = await analyze(unevenChunks(bytes))

  assert.deepEqual(chunkEvidence, wholeEvidence)
  assert.deepEqual(chunkEvidence.summary, {
    suppliedRows: 8,
    parsedRows: 7,
    invalidRows: 1,
    crawlerRows: 6,
    nonCrawlerRows: 1,
    responseBytes: 1_097,
    firstSeenAt: '2025-10-10T13:55:36.000Z',
    lastSeenAt: '2025-10-10T14:01:36.000Z',
  })
})
