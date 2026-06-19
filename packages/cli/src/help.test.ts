import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url))

async function runSeo(args: string[]): Promise<string> {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      CI: '1',
      NO_UPDATE_NOTIFIER: '1',
    },
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  })
  return `${result.stdout}${result.stderr}`
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
