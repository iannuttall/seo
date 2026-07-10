import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url))

async function runSeo(
  args: string[],
  env: Record<string, string> = {},
): Promise<string> {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      ...env,
      CI: '1',
      NO_UPDATE_NOTIFIER: '1',
    },
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  })
  return `${result.stdout}${result.stderr}`
}

async function runSeoResult(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
      },
      maxBuffer: 1024 * 1024,
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

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        ;(server as Server).close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

test('root help stays curated and useful', async () => {
  const output = await runSeo(['help'])

  assert.match(output, /seo start/)
  assert.match(output, /seo report/)
  assert.match(output, /seo projects list/)
  assert.match(output, /seo refresh-priorities/)
  assert.match(output, /seo quick-wins/)
  assert.match(output, /seo second-page/)
  assert.match(output, /seo technical-watch/)
  assert.doesNotMatch(output, /Unknown command help/)
  assert.doesNotMatch(output, /seo crawl\s/)
})

test('long help and crawler command help are available', async () => {
  const all = await runSeo(['help', 'all'])
  assert.match(all, /seo crawl\s+Crawl a site/)
  assert.match(all, /seo crawl-reports\s+List saved crawl reports/)

  for (const args of [
    ['report', '--help'],
    ['projects', '--help'],
    ['start', '--help'],
    ['crawl', '--help'],
    ['crawl-reports', '--help'],
    ['internal-links', '--help'],
    ['cannibal', '--help'],
    ['decaying', '--help'],
    ['pseo', 'audit', '--help'],
  ]) {
    const output = await runSeo(args)
    assert.doesNotMatch(output, /Unknown command/)
    assert.match(output, /USAGE|Usage:/)
  }
})

test('cannibal help exposes bounded discovery controls', async () => {
  const output = await runSeo(['cannibal', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--min-impressions',
    '--brand-terms',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('decaying help exposes bounded comparison controls', async () => {
  const output = await runSeo(['decaying', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--comparison',
    '--min-drop-pct',
    '--min-previous-clicks',
    '--min-click-loss',
    '--brand-terms',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('decaying JSON rejects invalid flags before authentication', async () => {
  for (const args of [
    [
      'decaying',
      '--site',
      'sc-domain:example.com',
      '--limit',
      'later',
      '--json',
    ],
    [
      'decaying',
      '--site',
      'sc-domain:example.com',
      '--comparison',
      'weekly',
      '--json',
    ],
  ]) {
    const result = await runSeoResult(args)
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('internal-links help exposes bounded matching and fetch controls', async () => {
  const output = await runSeo(['internal-links', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--check-limit',
    '--min-impressions',
    '--brand-terms',
    '--fetch-concurrency',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('pSEO help exposes bounded discovery and sampling controls', async () => {
  const output = await runSeo(['pseo', 'audit', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--minimum-template-urls',
    '--minimum-template-share',
    '--minimum-template-impressions',
    '--max-sitemap-urls',
    '--crawl-samples',
    '--inspect-samples',
    '--fetch-concurrency',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('pSEO JSON rejects invalid bounds before authentication', async () => {
  for (const args of [
    ['--crawl-samples', '11'],
    ['--minimum-template-share', '1.1'],
    ['--days', 'later'],
  ]) {
    const result = await runSeoResult([
      'pseo',
      'audit',
      '--site',
      'sc-domain:example.com',
      ...args,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('index-watch help exposes bounded quota and inventory controls', async () => {
  const output = await runSeo(['index-watch', '--help'])

  for (const flag of [
    '--urls',
    '--sitemaps',
    '--daily-limit',
    '--inspect-limit',
    '--max-urls',
    '--target-days',
    '--language',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('index-watch JSON rejects unsafe bounds before authentication', async () => {
  for (const args of [
    ['--urls', 'https://example.com/a', '--daily-limit', '2001'],
    ['--sitemaps', 'https://example.com/sitemap.xml', '--inspect-limit', '101'],
  ]) {
    const result = await runSeoResult([
      'index-watch',
      '--site',
      'sc-domain:example.com',
      ...args,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('version aliases and nested command help are available', async () => {
  assert.match(await runSeo(['--version']), /0\.1\.0/)
  assert.match(await runSeo(['-v']), /0\.1\.0/)

  for (const args of [
    ['content', 'optimize', '--help'],
    ['monitoring', 'cron', '--help'],
    ['export', 'refresh-priorities', '--help'],
  ]) {
    const output = await runSeo(args)
    assert.doesNotMatch(output, /Unknown command/)
    assert.match(output, /USAGE|Usage:/)
  }
})

test('unknown commands emit one error and exit with failure', async () => {
  const result = await runSeoResult(['definitely-not-a-command'])
  const output = `${result.stdout}${result.stderr}`

  assert.equal(result.exitCode, 1)
  assert.equal(output.match(/Unknown command/g)?.length, 1)
})

test('report JSON fails clearly when Google auth is missing', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-cli-cache-'))

  try {
    const result = await runSeoResult(
      ['report', '--site', 'sc-domain:example.com', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 3)
    assert.equal(result.stderr, '')
    assert.deepEqual(output, {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Not logged in. Run `seo auth login` first.',
        retryable: false,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('OKF JSON validation failures use a failing exit code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-okf-invalid-'))
  try {
    await writeFile(join(directory, 'index.md'), '# Not an OKF bundle\n')
    const result = await runSeoResult(['okf', 'validate', directory, '--json'])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 1)
    assert.equal(output.valid, false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('OKF rejects invalid concept limits before reading crawl state', async () => {
  for (const value of ['later', '0', '1.5', '5001']) {
    const result = await runSeoResult([
      'okf',
      'export',
      '--max-concepts',
      value,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('crawler negated flags disable sitemap and external checks', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/llms.txt') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain')
      res.end('missing')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      '<title>Local test</title><meta name="description" content="Local test page"><h1>Local test</h1><p>Enough local text for a simple crawler smoke test.</p><a href="https://example.com/offsite">Offsite</a>',
    )
  })

  try {
    const output = await runSeo([
      'crawl',
      fixture.baseUrl,
      '--max-pages',
      '1',
      '--no-sitemap',
      '--no-external',
      '--json',
    ])
    const report = JSON.parse(output)

    assert.equal(report.config.useSitemap, false)
    assert.equal(report.config.checkExternal, false)
    assert.equal(report.summary.totalPages, 1)
  } finally {
    await fixture.close()
  }
})

test('crawl-reports compares latest against the previous saved report', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-cli-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }
  let snapshotRequests = 0
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/llms.txt') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain')
      res.end('missing')
      return
    }
    res.setHeader('content-type', 'text/html')
    snapshotRequests += 1
    res.end(
      `<title>Snapshot fixture ${snapshotRequests}</title><meta name="description" content="Snapshot fixture page"><h1>Snapshot fixture</h1><p>Enough text for saved crawl report fixture ${snapshotRequests}.</p>`,
    )
  })

  try {
    const beforeRun = JSON.parse(
      await runSeo(
        [
          'crawl',
          `${fixture.baseUrl}/snapshot`,
          '--max-pages',
          '1',
          '--no-sitemap',
          '--no-external',
          '--refresh',
          '--save',
          '--json',
        ],
        env,
      ),
    ) as { id: string; definitionId: string }
    const afterRun = JSON.parse(
      await runSeo(
        [
          'crawl',
          `${fixture.baseUrl}/snapshot`,
          '--max-pages',
          '1',
          '--no-sitemap',
          '--no-external',
          '--refresh',
          '--save',
          '--json',
        ],
        env,
      ),
    ) as { id: string; definitionId: string }

    assert.notEqual(beforeRun.id, afterRun.id)
    assert.equal(beforeRun.definitionId, afterRun.definitionId)

    const output = await runSeo(
      [
        'crawl-reports',
        '--compare',
        'latest',
        '--against',
        'previous',
        '--json',
      ],
      env,
    )
    const diff = JSON.parse(output) as {
      before: { id: string; url: string }
      after: { id: string; url: string }
      summary: { titleChanges: number; contentChanges: number }
    }

    assert.notEqual(diff.before.id, diff.after.id)
    assert.equal(diff.before.url, `${fixture.baseUrl}/snapshot`)
    assert.equal(diff.after.url, `${fixture.baseUrl}/snapshot`)
    assert.equal(diff.summary.titleChanges, 1)
    assert.equal(diff.summary.contentChanges, 1)
  } finally {
    await fixture.close()
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
