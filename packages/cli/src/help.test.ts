import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
  ]) {
    const output = await runSeo(args)
    assert.doesNotMatch(output, /Unknown command/)
    assert.match(output, /USAGE|Usage:/)
  }
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
      '<title>Snapshot fixture page</title><meta name="description" content="Snapshot fixture page"><h1>Snapshot fixture</h1><p>Enough text for a saved crawl report fixture.</p>',
    )
  })

  try {
    await runSeo(
      [
        'crawl',
        `${fixture.baseUrl}/before`,
        '--max-pages',
        '1',
        '--no-sitemap',
        '--no-external',
        '--save',
        '--json',
      ],
      env,
    )
    await runSeo(
      [
        'crawl',
        `${fixture.baseUrl}/after`,
        '--max-pages',
        '1',
        '--no-sitemap',
        '--no-external',
        '--save',
        '--json',
      ],
      env,
    )

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
      before: { url: string }
      after: { url: string }
    }

    assert.equal(diff.before.url, `${fixture.baseUrl}/before`)
    assert.equal(diff.after.url, `${fixture.baseUrl}/after`)
  } finally {
    await fixture.close()
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
