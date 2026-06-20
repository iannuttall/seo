import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlStatusEvent } from './report.js'
import { type CrawlSiteDependencies, crawlSite } from './site-crawl.js'

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

function crawlPageSnapshot(
  url: string,
  input: Partial<CrawlPageSnapshot> = {},
): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    responseTimeMs: 20,
    title: 'Large site fixture page',
    metaDescription: 'Large site fixture page description.',
    h1: 'Large site fixture page',
    h1Count: 1,
    h2Count: 1,
    h3Count: 0,
    indexable: true,
    wordCount: 180,
    contentHash: `hash-${url}`,
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: true,
      hasDate: true,
      questionHeadings: 1,
      structuredBlocks: 1,
      answerable: true,
    },
    ...input,
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

test('crawlSite emits queue-friendly status events', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/llms.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('# Test site\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    if (req.url === '/') {
      res.end(
        '<title>Home</title><h1>Home</h1><a href="/a">A</a><a href="/asset.pdf">PDF</a><a href="https://example.org/offsite">Offsite</a>',
      )
      return
    }
    res.end('<title>A</title><h1>A</h1>')
  })

  try {
    const events: CrawlStatusEvent[] = []
    const report = await crawlSite({
      url: fixture.baseUrl,
      useSitemap: false,
      checkExternal: false,
      concurrency: 1,
      onStatus: async (event) => {
        events.push(event)
      },
    })

    assert.equal(report.status, 'completed')
    assert.equal('onStatus' in report.config, false)
    assert.deepEqual(
      events.map((event) => event.phase),
      [
        'started',
        'url_queued',
        'page_started',
        'page_completed',
        'url_queued',
        'url_skipped',
        'page_started',
        'page_completed',
        'completed',
      ],
    )
    assert.equal(events.at(-1)?.reportId, report.id)
    assert.equal(events.at(-1)?.reportStatus, report.status)
    assert.equal(events.at(-1)?.crawledUrls, report.summary.crawledUrls)
    assert.equal(events.at(-1)?.queuedUrls, report.summary.queuedUrls)
    assert.equal(events.at(-1)?.skippedUrls, report.summary.skippedUrls)
    assert.equal(
      events.find((event) => event.reason === 'asset_url')?.url,
      `${fixture.baseUrl}/asset.pdf`,
    )
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
      ['/sitemap-only', '/blocked'],
    )
    assert.equal(report.summary.discoveredUrls, 2)
    assert.equal(report.summary.queuedUrls, 2)
    assert.equal(report.summary.crawledUrls, 2)
    assert.equal(report.summary.skippedUrls, 1)
    assert.equal(report.summary.failedUrls, 0)
    assert.equal(report.pages[1]?.blocked, true)
    assert.equal(report.pages[1]?.indexability, 'Robots.txt disallowed')
    assert.equal(
      report.issues.some((issue) => issue.ruleId === 'robots_blocked'),
      true,
    )
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
      `<title>New</title><link rel="canonical" href="/new"><link rel="alternate" hreflang="en" href="/new"><h1>New</h1>`,
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
    assert.equal(report.pages[0]?.canonicalRaw, '/new')
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

test('crawlSite passes cache and rate controls through the shared fetch layer', async () => {
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
      refresh: true,
      fetchRate: {
        intervalCap: 2,
        intervalMs: 250,
      },
      timeoutMs: 5_000,
    })

    assert.equal(report.status, 'completed')
    assert.equal(report.summary.totalPages, 1)
    assert.equal(report.pages[0]?.fetchDiagnostics?.rateLimit.concurrency, 3)
    assert.equal(report.pages[0]?.fetchDiagnostics?.rateLimit.intervalCap, 2)
    assert.equal(report.pages[0]?.fetchDiagnostics?.rateLimit.intervalMs, 250)
    assert.equal(report.pages[0]?.fetchDiagnostics?.cache, 'bypass')
  } finally {
    await fixture.close()
  }
})

test('crawlSite bounds large-site limits, concurrency, and skipped URLs', async () => {
  const calls: string[] = []
  let activeFetches = 0
  let maxActiveFetches = 0
  const rootLinks = [
    ...Array.from(
      { length: 40 },
      (_, index) => `https://example.com/page-${index}`,
    ),
    ...Array.from(
      { length: 10 },
      (_, index) => `https://example.com/asset-${index}.pdf`,
    ),
    'https://external.example/offsite-a',
    'https://external.example/offsite-b',
  ]

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      useSitemap: false,
      checkExternal: false,
      maxPages: 3,
      maxDepth: 5,
      concurrency: 2,
    },
    {
      fetch: async () =>
        new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => {
        calls.push(url)
        activeFetches += 1
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeFetches -= 1
        const urls = url.endsWith('/') ? rootLinks : []
        return {
          urls,
          page: crawlPageSnapshot(url, {
            outgoingInternalCount: urls.length,
            sampleInternalLinks: urls.slice(0, 25),
          }),
        }
      },
    },
  )

  assert.equal(report.status, 'partial')
  assert.equal(report.summary.totalPages, 3)
  assert.equal(report.summary.crawledUrls, 3)
  assert.equal(report.summary.queuedUrls, 15)
  assert.equal(report.summary.skippedUrls, 38)
  assert.equal(report.summary.failedUrls, 0)
  assert.equal(maxActiveFetches, 2)
  assert.equal(calls.length, 3)
  assert.match(report.caveats.join('\n'), /maxPages \(3\)/)
})

test('crawlSite keeps large-site cancellation bounded', async () => {
  const controller = new AbortController()
  const calls = {
    fetchPages: [] as string[],
    externalChecks: 0,
    searchMetrics: 0,
    analytics: 0,
  }
  let childStarts = 0
  let activeFetches = 0
  let maxActiveFetches = 0

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      site: 'sc-domain:example.com',
      ga4PropertyId: 'properties/123',
      useSitemap: false,
      checkExternal: true,
      maxPages: 50,
      maxDepth: 2,
      concurrency: 4,
      signal: controller.signal,
    },
    {
      fetch: async (url) => {
        if (url.includes('external.example')) calls.externalChecks += 1
        return new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      },
      fetchPage: async (url) => {
        calls.fetchPages.push(url)
        activeFetches += 1
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
        if (url !== 'https://example.com/') {
          childStarts += 1
          if (childStarts === 2) {
            controller.abort()
            return new Promise(() => undefined)
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeFetches -= 1
        const urls = url.endsWith('/')
          ? Array.from(
              { length: 100 },
              (_, index) => `https://example.com/queued-${index}`,
            )
          : ['https://external.example/gone']
        return {
          urls,
          page: crawlPageSnapshot(url, {
            outgoingInternalCount: urls.length,
            sampleInternalLinks: urls.slice(0, 25),
            sampleExternalLinks: ['https://external.example/gone'],
          }),
        }
      },
      queryPageMetrics: async () => {
        calls.searchMetrics += 1
        return undefined
      },
      fetchLandingPageValues: async () => {
        calls.analytics += 1
        return { values: new Map() }
      },
    },
  )

  assert.equal(report.status, 'partial')
  assert.equal(report.summary.totalPages, 1)
  assert.equal(report.summary.queuedUrls, 101)
  assert.equal(report.summary.skippedUrls, 0)
  assert.equal(maxActiveFetches <= 4, true)
  assert.deepEqual(calls.fetchPages, [
    'https://example.com/',
    'https://example.com/queued-0',
    'https://example.com/queued-1',
  ])
  assert.equal(calls.externalChecks, 0)
  assert.equal(calls.searchMetrics, 0)
  assert.equal(calls.analytics, 0)
  assert.match(report.warnings.join('\n'), /cancelled/)
  assert.match(report.caveats.join('\n'), /cancelled/)
})

test('crawlSite accepts hosted-safe provider dependencies', async () => {
  const calls = {
    fetchUrls: [] as string[],
    sitemap: 0,
    searchMetrics: [] as Array<{ site: string; pageUrl: string }>,
    topQueries: [] as Array<{ site: string; pageUrl: string }>,
    analytics: [] as Array<{
      propertyId?: string
      startDate: string
      endDate: string
      limit?: number
    }>,
  }
  const analyticsValues = new Map([
    [
      '/',
      {
        sessions: 42,
        totalUsers: 30,
        conversions: 3,
      },
    ],
  ])
  const dependencies: CrawlSiteDependencies = {
    fetchSitemapUrls: async (input) => {
      calls.sitemap += 1
      return {
        sitemapUrl: input.sitemapUrl,
        urls: [],
        nestedSitemaps: [],
        warnings: [],
      }
    },
    fetch: async (url) => {
      calls.fetchUrls.push(url)
      if (url.endsWith('/llms.txt')) {
        return new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }
      return new Response('', { status: 404 })
    },
    fetchPage: async (url, options = {}) => ({
      urls: [],
      page: {
        url,
        finalUrl: url,
        status: 200,
        contentType: 'text/html',
        responseTimeMs: 123,
        fetchDiagnostics: {
          source: 'network',
          cache: 'miss',
          fetched: true,
          rendered: false,
          blocked: false,
          durationMs: 123,
          retries: 0,
          rateLimit: {
            host: new URL(url).host,
            concurrency: options.rate?.concurrency ?? 1,
            intervalCap: 1,
            intervalMs: 0,
          },
        },
        title: 'Adapter page',
        metaDescription: 'Adapter meta description.',
        h1: 'Adapter page',
        h1Count: 1,
        h2Count: 0,
        h3Count: 0,
        indexable: true,
        wordCount: 120,
        contentHash: 'adapter-hash',
        outgoingInternalCount: 0,
        outgoingExternalCount: 1,
        sampleExternalLinks: ['https://external.example/gone'],
        schemaTypes: ['Article'],
        geo: {
          semanticHtml: true,
          structuredData: true,
          hasAuthor: true,
          hasDate: true,
          questionHeadings: 1,
          structuredBlocks: 2,
          answerable: true,
        },
      },
    }),
    queryPageMetrics: async (site, pageUrl) => {
      calls.searchMetrics.push({ site, pageUrl })
      return {
        clicks: 5,
        impressions: 100,
        ctr: 0.05,
        position: 3.2,
      }
    },
    queryPageTopQuery: async (site, pageUrl) => {
      calls.topQueries.push({ site, pageUrl })
      return {
        query: 'adapter page',
        clicks: 2,
        impressions: 80,
        ctr: 0.025,
        position: 4,
      }
    },
    fetchLandingPageValues: async (input) => {
      calls.analytics.push(input)
      return { values: analyticsValues }
    },
    landingValueForUrl: (values, url) =>
      values.get(new URL(url).pathname.replace(/\/$/, '') || '/'),
    now: () => new Date('2026-06-19T00:00:00.000Z'),
  }

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      site: 'sc-domain:example.com',
      ga4PropertyId: 'properties/123',
      useSitemap: true,
      checkExternal: true,
      maxPages: 1,
      concurrency: 2,
    },
    dependencies,
  )

  assert.equal(report.status, 'partial')
  assert.equal(calls.sitemap, 1)
  assert.deepEqual(calls.fetchUrls, [
    'https://example.com/llms.txt',
    'https://example.com/robots.txt',
    'https://example.com/.well-known/agent.json',
    'https://example.com/agent.json',
    'https://example.com/.well-known/mcp.json',
    'https://example.com/.well-known/ai-plugin.json',
    'https://example.com/.well-known/openapi.json',
    'https://example.com/openapi.json',
    'https://external.example/gone',
  ])
  assert.deepEqual(calls.searchMetrics, [
    {
      site: 'sc-domain:example.com',
      pageUrl: 'https://example.com/',
    },
  ])
  assert.deepEqual(calls.topQueries, [
    {
      site: 'sc-domain:example.com',
      pageUrl: 'https://example.com/',
    },
  ])
  assert.deepEqual(calls.analytics, [
    {
      propertyId: 'properties/123',
      startDate: '2026-05-19',
      endDate: '2026-06-15',
      limit: 5000,
    },
  ])
  assert.deepEqual(report.pages[0]?.searchMetrics, {
    clicks: 5,
    impressions: 100,
    ctr: 0.05,
    position: 3.2,
  })
  assert.deepEqual(report.pages[0]?.topQuery, {
    query: 'adapter page',
    clicks: 2,
    impressions: 80,
    ctr: 0.025,
    position: 4,
  })
  assert.deepEqual(report.pages[0]?.analytics, {
    sessions: 42,
    totalUsers: 30,
    conversions: 3,
  })
  assert.equal(report.pages[0]?.geo?.hasLlmsTxt, true)
  assert.equal(report.ai?.llmsTxt?.exists, true)
  assert.equal(report.ai?.robotsTxt?.exists, false)
  assert.equal(report.ai?.agentResources?.length, 6)
  assert.deepEqual(report.pages[0]?.externalLinkChecks, [
    { url: 'https://external.example/gone', status: 404 },
  ])
  assert.equal(
    report.issues.some((issue) => issue.ruleId === 'broken_external_link'),
    true,
  )
})

test('crawlSite skips auth data providers when no site or GA4 property is selected', async () => {
  const calls = {
    searchMetrics: 0,
    topQueries: 0,
    analytics: 0,
  }

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      useSitemap: false,
      checkExternal: false,
      maxPages: 2,
    },
    {
      fetch: async () =>
        new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => ({
        urls: [],
        page: {
          url,
          finalUrl: url,
          status: 200,
          contentType: 'text/html',
          responseTimeMs: 10,
          title: 'No auth page',
          metaDescription: 'No auth page description.',
          h1: 'No auth page',
          h1Count: 1,
          h2Count: 0,
          h3Count: 0,
          indexable: true,
          wordCount: 140,
          contentHash: 'no-auth-hash',
          outgoingInternalCount: 0,
          outgoingExternalCount: 0,
          geo: {
            semanticHtml: true,
            structuredData: true,
            hasAuthor: true,
            hasDate: true,
            questionHeadings: 1,
            structuredBlocks: 1,
            answerable: true,
          },
        },
      }),
      queryPageMetrics: async () => {
        calls.searchMetrics += 1
        throw new Error('GSC should not be called without a site.')
      },
      queryPageTopQuery: async () => {
        calls.topQueries += 1
        throw new Error('GSC top query should not be called without a site.')
      },
      fetchLandingPageValues: async () => {
        calls.analytics += 1
        throw new Error('GA4 should not be called without a property.')
      },
    },
  )

  assert.equal(report.status, 'completed')
  assert.equal(calls.searchMetrics, 0)
  assert.equal(calls.topQueries, 0)
  assert.equal(calls.analytics, 0)
  assert.equal(report.pages[0]?.searchMetrics, undefined)
  assert.equal(report.pages[0]?.topQuery, undefined)
  assert.equal(report.pages[0]?.analytics, undefined)
})

test('crawlSite returns a partial report when cancelled before work starts', async () => {
  const controller = new AbortController()
  controller.abort()
  let fetchPageCalls = 0

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      maxPages: 10,
      useSitemap: true,
      checkExternal: true,
      signal: controller.signal,
    },
    {
      fetchPage: async () => {
        fetchPageCalls += 1
        return { urls: [] }
      },
      fetchSitemapUrls: async (input) => ({
        sitemapUrl: input.sitemapUrl,
        urls: ['https://example.com/queued'],
        nestedSitemaps: [],
        warnings: [],
      }),
    },
  )

  assert.equal(fetchPageCalls, 0)
  assert.equal(report.status, 'partial')
  assert.equal(report.summary.totalPages, 0)
  assert.match(report.warnings.join('\n'), /cancelled/)
  assert.match(report.caveats.join('\n'), /cancelled/)
})

test('crawlSite returns completed pages and skips joins after cancellation', async () => {
  const controller = new AbortController()
  const calls = {
    fetchPages: [] as string[],
    externalChecks: 0,
    searchMetrics: 0,
    analytics: 0,
  }

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      site: 'sc-domain:example.com',
      ga4PropertyId: 'properties/123',
      useSitemap: false,
      checkExternal: true,
      maxPages: 10,
      signal: controller.signal,
    },
    {
      fetch: async (url) => {
        calls.externalChecks += url.includes('external.example') ? 1 : 0
        return new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      },
      fetchPage: async (url, options = {}) => {
        calls.fetchPages.push(url)
        assert.equal(options.signal, controller.signal)
        if (url.endsWith('/next')) {
          controller.abort()
          return new Promise(() => undefined)
        }
        return {
          urls: ['https://example.com/next'],
          page: {
            url,
            finalUrl: url,
            status: 200,
            contentType: 'text/html',
            responseTimeMs: 10,
            title: 'Cancelled page',
            metaDescription: 'Cancelled page description.',
            h1: 'Cancelled page',
            h1Count: 1,
            h2Count: 0,
            h3Count: 0,
            indexable: true,
            wordCount: 140,
            contentHash: 'cancelled-hash',
            outgoingInternalCount: 1,
            outgoingExternalCount: 1,
            sampleInternalLinks: ['https://example.com/next'],
            sampleExternalLinks: ['https://external.example/gone'],
            geo: {
              semanticHtml: true,
              structuredData: true,
              hasAuthor: true,
              hasDate: true,
              questionHeadings: 1,
              structuredBlocks: 1,
              answerable: true,
            },
          },
        }
      },
      queryPageMetrics: async () => {
        calls.searchMetrics += 1
        return undefined
      },
      fetchLandingPageValues: async () => {
        calls.analytics += 1
        return { values: new Map() }
      },
    },
  )

  assert.deepEqual(calls.fetchPages, [
    'https://example.com/',
    'https://example.com/next',
  ])
  assert.equal(calls.externalChecks, 0)
  assert.equal(calls.searchMetrics, 0)
  assert.equal(calls.analytics, 0)
  assert.equal(report.status, 'partial')
  assert.equal(report.summary.totalPages, 1)
  assert.match(report.warnings.join('\n'), /cancelled/)
  assert.match(report.caveats.join('\n'), /cancelled/)
})
