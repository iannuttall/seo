import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { listReports } from '@seo/mcp'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))
const reportCount = listReports().length

async function runSeo(args: string[]): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
      },
      timeout: 10_000,
    })
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const result = error as {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      exitCode: result.code ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  }
}

test('reports list exposes the shared sorted catalog', async () => {
  const result = await runSeo(['reports', 'list', '--json'])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  const output = JSON.parse(result.stdout)
  assert.equal(output.reports.length, reportCount)
  assert.deepEqual(output.categories, [
    'ai-search',
    'crawl',
    'diagnosis',
    'monitoring',
    'opportunities',
    'reporting',
    'setup',
    'workflows',
  ])
  assert.deepEqual(
    output.reports.map((report: { id: string }) => report.id),
    [...output.reports]
      .map((report: { id: string }) => report.id)
      .sort((a: string, b: string) => a.localeCompare(b)),
  )
  assert.ok(
    output.reports.every(
      (report: Record<string, unknown>) =>
        typeof report.name === 'string' &&
        typeof report.description === 'string' &&
        !('useWhen' in report),
    ),
  )
})

test('reports describe returns the exact report input schema', async () => {
  const result = await runSeo(['reports', 'describe', 'audit-page', '--json'])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  const output = JSON.parse(result.stdout)
  assert.equal(output.report.id, 'audit-page')
  assert.deepEqual(output.report.inputSchema.required, ['url'])
  assert.equal(output.report.inputSchema.additionalProperties, false)
})

test('reports run validates inline and file parameters consistently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-report-params-'))
  const paramsFile = join(directory, 'params.json')
  await writeFile(paramsFile, '{}\n')

  try {
    for (const args of [
      ['reports', 'run', 'audit-page', '--params', '{}', '--json'],
      ['reports', 'run', 'audit-page', '--params-file', paramsFile, '--json'],
    ]) {
      const result = await runSeo(args)
      assert.equal(result.exitCode, 2)
      assert.equal(result.stderr, '')
      assert.match(
        JSON.parse(result.stdout).error.message,
        /Invalid parameters for audit-page: url:/,
      )
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('reports run exposes the shared actions-only view', async () => {
  const result = await runSeo([
    'reports',
    'run',
    'crawler-rules',
    '--params',
    '{"category":"metadata"}',
    '--actions-only',
    '--json',
  ])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  const output = JSON.parse(result.stdout)
  assert.equal(output.view, 'actions')
  assert.equal(output.report.id, 'crawler-rules')
  assert.equal(output.findings.counts.total, 0)
  assert.equal('rules' in output, false)
  assert.equal(output.outputBudget.returnedBytes > 0, true)
})
