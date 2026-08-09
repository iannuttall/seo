import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderServerLogCsv, serverLogErrorPaths } from './csv.js'
import { importServerLog } from './import.js'

const combinedFixture = fileURLToPath(
  new URL('../../../../fixtures/server-logs/combined.log', import.meta.url),
)

test('renders deterministic crawler, path, error, and status CSV files', async () => {
  const evidence = await importServerLog({ file: combinedFixture })
  const summary = renderServerLogCsv(evidence, 'crawler-summary')
  const paths = renderServerLogCsv(evidence, 'crawler-paths')
  const errors = renderServerLogCsv(evidence, 'crawler-errors')
  const statuses = renderServerLogCsv(evidence, 'status-codes')

  assert.equal(summary.filename, 'crawler-summary.csv')
  assert.match(summary.content, /^crawler,category,requests,/u)
  assert.match(summary.content, /Googlebot,search,3,2,0,1,0,0/u)
  assert.match(paths.content, /Googlebot,search,\/docs,2/u)
  assert.match(errors.content, /Anthropic,ai,\/api,1,0,1/u)
  assert.match(errors.content, /Googlebot,search,\/missing,1,1,0/u)
  assert.equal(
    statuses.content,
    'status,requests\n200,4\n301,1\n404,1\n500,1\n',
  )
  assert.deepEqual(
    serverLogErrorPaths(evidence).map((row) => row.path),
    ['/api', '/missing'],
  )
})

test('CSV output stops before its total byte budget', async () => {
  const evidence = await importServerLog({ file: combinedFixture })
  const headerOnlyBytes = new TextEncoder().encode(
    'crawler,category,path,requests,success_2xx,redirect_3xx,client_error_4xx,server_error_5xx,other_status,last_seen_at\n',
  ).byteLength
  const output = renderServerLogCsv(evidence, 'crawler-paths', {
    maximumRows: 25_000,
    maximumBytes: headerOnlyBytes + 1,
  })

  assert.equal(output.rowsReturned, 0)
  assert.equal(output.capped, true)
  assert.ok(output.omittedRows > 0)
  assert.ok(output.bytes <= headerOnlyBytes + 1)
})

test('shared fixtures remain fake and contain no public host data', async () => {
  const contents = await readFile(combinedFixture, 'utf8')
  assert.match(contents, /127\.0\.0\.1/u)
  assert.doesNotMatch(contents, /seoskill\.dev|iannuttall/u)
})
