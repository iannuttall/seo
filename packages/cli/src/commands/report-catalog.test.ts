import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

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
  assert.equal(output.reports.length, 53)
  assert.deepEqual(output.categories, [
    'ai-search',
    'crawl',
    'diagnosis',
    'experiments',
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

test('reports list stays browsable for humans', async () => {
  const result = await runSeo(['reports', 'list'])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  assert.ok(!result.stdout.includes(String.fromCharCode(27)))
  assert.match(result.stdout, /^53 reports across 9 categories\./)
  assert.match(result.stdout, /^AI search \(7\)$/m)
  assert.match(result.stdout, /affected-urls\s+URLs affected by a crawl issue/)
  assert.match(result.stdout, /seo reports describe <id>/)
  assert.doesNotMatch(result.stdout, /^Description\s/m)
  assert.ok(result.stdout.split('\n').length < 100)
})

test('reports describe returns the exact report input schema', async () => {
  const result = await runSeo(['reports', 'describe', 'audit-page', '--json'])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  const output = JSON.parse(result.stdout)
  assert.equal(output.report.id, 'audit-page')
  assert.equal(output.report.category, 'reporting')
  assert.equal(output.report.name, 'Single-page SEO audit')
  assert.deepEqual(output.report.useWhen, [
    'One page needs a technical review before you change it.',
    'A broader report points to a specific URL.',
  ])
  assert.deepEqual(output.report.avoidWhen, [
    'You need to discover issues across a whole site.',
    'The page requires a logged-in browser session.',
  ])
  assert.equal(
    output.report.outcome,
    'A page-level audit that separates observed evidence from review advice.',
  )
  assert.deepEqual(output.report.inputSchema.required, ['url'])
  assert.equal(output.report.inputSchema.additionalProperties, false)
})

test('reports describe explains when the report is useful', async () => {
  const result = await runSeo(['reports', 'describe', 'audit-page'])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  assert.ok(!result.stdout.includes(String.fromCharCode(27)))
  assert.match(result.stdout, /^Single-page SEO audit$/m)
  assert.match(result.stdout, /Outcome\s+A page-level audit/)
  assert.match(result.stdout, /Use when/)
  assert.match(result.stdout, /Avoid when/)
  assert.match(result.stdout, /^Parameters$/m)
  assert.match(result.stdout, /^url$/m)
  assert.match(result.stdout, /string \(uri\) · required/)
  assert.match(result.stdout, /seo reports describe audit-page --json/)
  assert.doesNotMatch(result.stdout, /\$schema/)
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

test('reports reject unknown categories and malformed JSON clearly', async () => {
  const category = await runSeo([
    'reports',
    'list',
    '--category',
    'made-up',
    '--json',
  ])
  assert.equal(category.exitCode, 2)
  assert.match(
    JSON.parse(category.stdout).error.message,
    /Unknown report category/,
  )

  const params = await runSeo([
    'reports',
    'run',
    'audit-page',
    '--params',
    '{broken',
    '--json',
  ])
  assert.equal(params.exitCode, 2)
  assert.equal(
    JSON.parse(params.stdout).error.message,
    'Report parameters must be valid JSON.',
  )
})
