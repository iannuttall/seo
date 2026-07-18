import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { importServerLog } from './import.js'
import { serverLogReport } from './report.js'

const directories: string[] = []

async function fixture(name: string, contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'seo-server-log-'))
  directories.push(directory)
  const path = join(directory, name)
  await writeFile(path, contents)
  return path
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  )
})

function combined(path: string, status: number, userAgent: string): string {
  return `127.0.0.1 - - [10/Oct/2025:13:55:36 +0000] "GET ${path} HTTP/1.1" ${status} 123 "-" "${userAgent}"`
}

describe('server log import', () => {
  test('streams combined logs into bounded crawler evidence', async () => {
    const path = await fixture(
      'access.log',
      [
        combined('/one?x=1', 200, 'Googlebot/2.1'),
        combined('/one?x=2', 404, 'Googlebot/2.1'),
        combined('/two', 301, 'bingbot/2.0'),
        combined('/human', 200, 'Mozilla/5.0'),
        'malformed row',
      ].join('\n'),
    )

    const evidence = await importServerLog({ file: path })
    assert.deepEqual(evidence.summary, {
      suppliedRows: 5,
      parsedRows: 4,
      invalidRows: 1,
      crawlerRows: 3,
      nonCrawlerRows: 1,
      responseBytes: 492,
      firstSeenAt: '2025-10-10T13:55:36.000Z',
      lastSeenAt: '2025-10-10T13:55:36.000Z',
    })
    assert.deepEqual(
      evidence.crawlers.map((row) => ({
        family: row.family,
        requests: row.requests,
        success: row.success,
        redirect: row.redirect,
        clientError: row.clientError,
      })),
      [
        {
          family: 'Googlebot',
          requests: 2,
          success: 1,
          redirect: 0,
          clientError: 1,
        },
        {
          family: 'Bingbot',
          requests: 1,
          success: 0,
          redirect: 1,
          clientError: 0,
        },
      ],
    )
    assert.deepEqual(
      {
        family: evidence.crawlerPaths[0]?.family,
        path: evidence.crawlerPaths[0]?.path,
        requests: evidence.crawlerPaths[0]?.requests,
      },
      { family: 'Googlebot', path: '/one', requests: 2 },
    )
    assert.equal(evidence.provenance.completeness, 'partial')
    assert.ok(
      evidence.warnings.includes(
        '1 malformed or unsupported rows were skipped.',
      ),
    )
  })

  test('stops after the row cap without retaining raw rows', async () => {
    const rows = Array.from({ length: 20_000 }, (_, index) =>
      combined(`/page-${index}`, 200, 'Googlebot/2.1'),
    ).join('\n')
    const path = await fixture('large.log', rows)
    const evidence = await importServerLog({
      file: path,
      rowLimit: 1_000,
      pathLimit: 100,
    })

    assert.equal(evidence.summary.suppliedRows, 1_000)
    assert.equal(evidence.summary.crawlerRows, 1_000)
    assert.equal(evidence.crawlerPaths.length, 100)
    assert.deepEqual(evidence.provenance.coverage, {
      fileReadCompletely: false,
      rowsCapped: true,
      bytesCapped: false,
      pathsCapped: true,
      untrackedCrawlerPathRows: 900,
    })
    assert.ok(
      evidence.provenance.file.bytesRead < evidence.provenance.file.fileBytes,
    )
  })

  test('parses JSONL and bounds report output', async () => {
    const path = await fixture(
      'access.jsonl',
      [
        {
          timestamp: '2025-01-01T00:00:00Z',
          method: 'GET',
          path: '/a',
          status: 200,
          userAgent: 'ClaudeBot',
        },
        {
          timestamp: '2025-01-01T00:01:00Z',
          method: 'GET',
          path: '/b',
          status: 500,
          userAgent: 'ClaudeBot',
        },
      ]
        .map((row) => JSON.stringify(row))
        .join('\n'),
    )
    const evidence = await importServerLog({ file: path, format: 'jsonl' })
    const report = serverLogReport({ evidence, limit: 1 })

    assert.equal(report.dataStatus, 'complete')
    assert.equal(report.crawlerPaths.length, 1)
    assert.deepEqual(report.selection, {
      availableCrawlerPaths: 2,
      returnedCrawlerPaths: 1,
      omittedCrawlerPaths: 1,
      limit: 1,
    })
    assert.match(report.caveats.join(' '), /spoofed/)
  })
})
