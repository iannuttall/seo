import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { test } from 'node:test'
import { crawlSite } from './site-crawl.js'

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

test('crawlSite follows same-origin links within depth and page limits', async () => {
  const fixture = await withServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    if (req.url === '/robots.txt') {
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/') {
      res.end('<title>Home</title><h1>Home</h1><a href="/a">A</a>')
      return
    }
    if (req.url === '/a') {
      res.end('<title>A</title><h1>A</h1><a href="/b">B</a>')
      return
    }
    res.end('<title>B</title><h1>B</h1>')
  })

  try {
    const report = await crawlSite({
      url: fixture.baseUrl,
      useSitemap: false,
      maxDepth: 1,
      maxPages: 10,
      concurrency: 1,
    })

    assert.equal(report.summary.totalPages, 2)
    assert.deepEqual(
      report.pages.map((page) => new URL(page.url).pathname),
      ['/', '/a'],
    )
    assert.equal(report.status, 'completed')
  } finally {
    await fixture.close()
  }
})

test('crawlSite can seed from sitemap and skip robots-blocked URLs', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nDisallow: /blocked\n')
      return
    }
    if (req.url === '/sitemap.xml') {
      res.setHeader('content-type', 'application/xml')
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>${fixture.baseUrl}/sitemap-only</loc></url>
        <url><loc>${fixture.baseUrl}/blocked</loc></url>
      </urlset>`)
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(`<title>${req.url}</title><h1>${req.url}</h1>`)
  })

  try {
    const report = await crawlSite({
      url: fixture.baseUrl,
      mode: 'sitemap',
      maxPages: 10,
      concurrency: 1,
    })

    assert.deepEqual(
      report.pages.map((page) => new URL(page.url).pathname),
      ['/sitemap-only'],
    )
    assert.equal(report.status, 'partial')
    assert.match(report.warnings.join('\n'), /robots\.txt/)
  } finally {
    await fixture.close()
  }
})
