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
    if (req.url === '/llms.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('# Test site\n\n- /: Home\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    if (req.url === '/robots.txt') {
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/') {
      res.end(
        '<title>Home</title><script type="application/ld+json">{"@type":"FAQPage"}</script><h1>Home</h1><ul><li>One</li></ul><table><tr><td>One</td></tr></table><a href="/a">About A</a><a href="https://example.org/ref">External ref</a>',
      )
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
      checkExternal: false,
    })

    assert.equal(report.summary.totalPages, 2)
    assert.equal(report.summary.discoveredUrls, 2)
    assert.equal(report.summary.queuedUrls, 2)
    assert.equal(report.summary.crawledUrls, 2)
    assert.equal(report.summary.skippedUrls, 0)
    assert.equal(report.summary.failedUrls, 0)
    assert.equal(report.summary.verifiedLinks, 2)
    assert.deepEqual(
      report.pages.map((page) => new URL(page.url).pathname),
      ['/', '/a'],
    )
    assert.equal(report.pages[0]?.internalInlinkCount, 0)
    assert.equal(report.pages[0]?.internalLinkAuthorityScore, 0)
    assert.equal(report.pages[0]?.crawlDepth, 0)
    assert.equal(report.pages[0]?.geo?.hasLlmsTxt, true)
    assert.equal(
      report.pages[0]?.geo?.llmsTxtUrl,
      `${fixture.baseUrl}/llms.txt`,
    )
    assert.equal(report.pages[0]?.geo?.llmsTxtStatus, 200)
    assert.equal(report.pages[0]?.geo?.hasFaqSchema, true)
    assert.equal(report.pages[0]?.geo?.listCount, 1)
    assert.equal(report.pages[0]?.geo?.tableCount, 1)
    assert.equal(report.pages[0]?.outgoingExternalCount, 1)
    assert.deepEqual(report.pages[0]?.internalAnchorSamples, [
      { href: `${fixture.baseUrl}/a`, text: 'About A' },
    ])
    assert.deepEqual(report.pages[0]?.externalAnchorSamples, [
      { href: 'https://example.org/ref', text: 'External ref' },
    ])
    assert.equal(report.pages[1]?.internalInlinkCount, 1)
    assert.equal(report.pages[1]?.internalLinkAuthorityScore, 100)
    assert.equal(report.pages[1]?.crawlDepth, 1)
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
    assert.equal(report.summary.discoveredUrls, 2)
    assert.equal(report.summary.queuedUrls, 2)
    assert.equal(report.summary.crawledUrls, 1)
    assert.equal(report.summary.skippedUrls, 1)
    assert.equal(report.summary.failedUrls, 0)
    assert.equal(report.status, 'partial')
    assert.match(report.warnings.join('\n'), /robots\.txt/)
  } finally {
    await fixture.close()
  }
})

test('crawlSite reports redirected URLs with final target evidence', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/old') {
      res.statusCode = 301
      res.setHeader('location', '/new')
      res.setHeader('set-cookie', 'session=secret')
      res.end()
      return
    }
    res.setHeader('strict-transport-security', 'max-age=31536000')
    res.setHeader('x-test-header', 'visible')
    res.setHeader('content-type', 'text/html')
    res.end(
      `<title>New</title><link rel="alternate" hreflang="en" href="/new"><h1>New</h1>`,
    )
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/old`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
      concurrency: 1,
    })

    const issue = report.issues.find((item) => item.ruleId === 'redirected_url')

    assert.equal(report.pages[0]?.finalUrl, `${fixture.baseUrl}/new`)
    assert.deepEqual(report.pages[0]?.fetchDiagnostics?.redirectChain, [
      {
        url: `${fixture.baseUrl}/old`,
        status: 301,
        location: `${fixture.baseUrl}/new`,
      },
    ])
    assert.equal(report.pages[0]?.responseHeaders?.['x-test-header'], 'visible')
    assert.equal(report.pages[0]?.responseHeaders?.['set-cookie'], undefined)
    assert.equal(report.pages[0]?.hasHsts, true)
    assert.equal(report.pages[0]?.isHttps, false)
    assert.deepEqual(report.pages[0]?.hreflang, [
      { hreflang: 'en', href: `${fixture.baseUrl}/new` },
    ])
    assert.equal(issue?.evidence?.finalUrl, `${fixture.baseUrl}/new`)
  } finally {
    await fixture.close()
  }
})

test('crawlSite captures content types and reports broken internal links', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(
        '<title>Home</title><h1>Home</h1><a href="/missing">Missing</a><a href="/asset.pdf">Asset</a>',
      )
      return
    }
    if (req.url === '/asset.pdf') {
      res.setHeader('content-type', 'application/pdf')
      res.end('not really a pdf')
      return
    }
    res.statusCode = 404
    res.setHeader('content-type', 'text/html')
    res.end('<title>Missing</title><h1>Missing</h1>')
  })

  try {
    const report = await crawlSite({
      url: fixture.baseUrl,
      useSitemap: false,
      maxDepth: 1,
      maxPages: 10,
      concurrency: 1,
    })

    assert.deepEqual(
      report.pages.map((page) => new URL(page.url).pathname),
      ['/', '/missing'],
    )
    assert.equal(report.pages[0]?.contentType, 'text/html; charset=utf-8')
    assert.equal(report.pages[1]?.contentType, 'text/html')
    assert.equal(
      report.issues.some((issue) => issue.ruleId === 'client_error'),
      true,
    )
    assert.equal(
      report.issues.some((issue) => issue.ruleId === 'broken_internal_link'),
      true,
    )
    assert.equal(
      report.pages.some((page) => new URL(page.url).pathname === '/asset.pdf'),
      false,
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite checks broken external links when enabled', async () => {
  const external = await withServer((req, res) => {
    if (req.url === '/gone') {
      res.statusCode = 404
      res.end()
      return
    }
    res.end('ok')
  })
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      `<title>External</title><h1>External</h1><a href="${external.baseUrl}/gone">Broken external</a>`,
    )
  })

  try {
    const report = await crawlSite({
      url: fixture.baseUrl,
      useSitemap: false,
      maxPages: 1,
      concurrency: 1,
      checkExternal: true,
    })

    assert.deepEqual(report.pages[0]?.externalLinkChecks, [
      { url: `${external.baseUrl}/gone`, status: 404 },
    ])
    assert.equal(
      report.issues.some((issue) => issue.ruleId === 'broken_external_link'),
      true,
    )
  } finally {
    await fixture.close()
    await external.close()
  }
})

test('crawlSite passes rate controls through the shared fetch layer', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end('<title>Rate</title><h1>Rate</h1>')
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/rate-control`,
      useSitemap: false,
      maxPages: 10,
      concurrency: 3,
      timeoutMs: 5_000,
    })

    assert.equal(report.status, 'completed')
    assert.equal(report.summary.totalPages, 1)
    assert.equal(report.pages[0]?.fetchDiagnostics?.rateLimit.concurrency, 3)
    assert.equal(report.pages[0]?.fetchDiagnostics?.cache, 'miss')
  } finally {
    await fixture.close()
  }
})
