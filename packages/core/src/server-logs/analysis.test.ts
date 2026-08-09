import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeServerLogChunks, SERVER_LOG_LIMITS } from './analysis.js'
import { importServerLog } from './import.js'

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

test('browser-safe chunk analysis matches the Node file adapter', async () => {
  const bytes = await readFile(combinedFixture)
  const nodeEvidence = await importServerLog({ file: combinedFixture })
  const chunkEvidence = await analyzeServerLogChunks({
    chunks: unevenChunks(bytes),
    file: { path: combinedFixture, fileBytes: bytes.byteLength },
    format: 'combined',
    rowLimit: SERVER_LOG_LIMITS.defaultRows,
    pathLimit: SERVER_LOG_LIMITS.defaultPaths,
    byteLimit: SERVER_LOG_LIMITS.maximumBytes,
    maxLineBytes: SERVER_LOG_LIMITS.maximumLineBytes,
    observedAt: nodeEvidence.provenance.observedAt,
  })

  assert.deepEqual(chunkEvidence, nodeEvidence)
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

test('chunk analysis preserves UTF-8 and CRLF boundaries', async () => {
  const line =
    '127.0.0.1 - - [10/Oct/2025:13:55:36 +0000] "GET /caf%C3%A9 HTTP/1.1" 200 10 "-" "Googlebot/2.1 café"\r\n'
  const bytes = new TextEncoder().encode(line)
  const evidence = await analyzeServerLogChunks({
    chunks: unevenChunks(bytes),
    file: { path: 'utf8.log', fileBytes: bytes.byteLength },
    format: 'combined',
    rowLimit: 10,
    pathLimit: 10,
    byteLimit: bytes.byteLength,
    maxLineBytes: SERVER_LOG_LIMITS.maximumLineBytes,
  })

  assert.equal(evidence.summary.parsedRows, 1)
  assert.equal(evidence.crawlerPaths[0]?.path, '/caf%C3%A9')
  assert.equal(evidence.provenance.coverage.fileReadCompletely, true)
})

test('chunk analysis reports row and line caps', async () => {
  const rows = [
    'x'.repeat(100),
    '127.0.0.1 - - [10/Oct/2025:13:55:36 +0000] "GET /one HTTP/1.1" 200 10 "-" "Googlebot/2.1"',
    '127.0.0.1 - - [10/Oct/2025:13:55:37 +0000] "GET /two HTTP/1.1" 200 10 "-" "Googlebot/2.1"',
    '127.0.0.1 - - [10/Oct/2025:13:55:38 +0000] "GET /three HTTP/1.1" 200 10 "-" "Googlebot/2.1"',
  ].join('\n')
  const bytes = new TextEncoder().encode(rows)
  const evidence = await analyzeServerLogChunks({
    chunks: unevenChunks(bytes),
    file: { path: 'capped.log', fileBytes: bytes.byteLength + 100 },
    format: 'combined',
    rowLimit: 3,
    pathLimit: 1,
    byteLimit: bytes.byteLength,
    maxLineBytes: 50,
  })

  assert.equal(evidence.summary.suppliedRows, 3)
  assert.equal(evidence.summary.invalidRows, 3)
  assert.equal(evidence.provenance.completeness, 'partial')
  assert.equal(evidence.provenance.coverage.rowsCapped, true)
  assert.equal(evidence.provenance.coverage.bytesCapped, false)
  assert.match(evidence.warnings.join(' '), /stopped after 3 rows/u)
})

test('chunk analysis reports byte and path caps', async () => {
  const rows = [
    '127.0.0.1 - - [10/Oct/2025:13:55:36 +0000] "GET /one HTTP/1.1" 200 10 "-" "Googlebot/2.1"',
    '127.0.0.1 - - [10/Oct/2025:13:55:37 +0000] "GET /two HTTP/1.1" 200 10 "-" "Googlebot/2.1"',
    '127.0.0.1 - - [10/Oct/2025:13:55:38 +0000] "GET /three HTTP/1.1" 200 10 "-" "Googlebot/2.1"',
  ]
  const value = `${rows.join('\n')}\n`
  const bytes = new TextEncoder().encode(value)
  const evidence = await analyzeServerLogChunks({
    chunks: unevenChunks(bytes),
    file: { path: 'capped.log', fileBytes: bytes.byteLength },
    format: 'combined',
    rowLimit: 10,
    pathLimit: 1,
    byteLimit: new TextEncoder().encode(`${rows[0]}\n${rows[1]}\n`).byteLength,
    maxLineBytes: SERVER_LOG_LIMITS.maximumLineBytes,
  })

  assert.equal(evidence.summary.parsedRows, 2)
  assert.equal(evidence.summary.crawlerRows, 2)
  assert.equal(evidence.crawlerPaths.length, 1)
  assert.equal(evidence.provenance.coverage.bytesCapped, true)
  assert.equal(evidence.provenance.coverage.pathsCapped, true)
  assert.equal(evidence.provenance.coverage.untrackedCrawlerPathRows, 1)
  assert.equal(evidence.provenance.completeness, 'partial')
  assert.match(evidence.warnings.join(' '), /input bytes/u)
  assert.match(evidence.warnings.join(' '), /1 unique crawler and path pairs/u)
})
