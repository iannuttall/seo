import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { aiReadiness } from './ai-readiness.js'
import { crawlSite } from './site-crawl.js'
import { withServer } from './site-crawl.test-fixtures.js'

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
    title: 'Crawler evidence fixture page',
    metaDescription: 'Crawler evidence fixture page description.',
    h1: 'Crawler evidence fixture page',
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
    assert.equal(report.pages[0]?.url, `${fixture.baseUrl}/new`)
    assert.equal(report.requests[0]?.requestedUrl, `${fixture.baseUrl}/old`)
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
    assert.equal(issue?.url, `${fixture.baseUrl}/old`)
    assert.equal(
      report.issues.some(
        (item) => item.url === `${fixture.baseUrl}/old` && item !== issue,
      ),
      false,
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite preserves fetch failures as structured request evidence', async () => {
  const url = 'https://missing.example/'
  const report = await crawlSite(
    {
      url,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
      concurrency: 1,
    },
    {
      fetch: async () =>
        new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async () => ({
        request: {
          requestedUrl: url,
          outcome: 'failure',
          durationMs: 120,
          failureKind: 'dns',
          error: 'getaddrinfo ENOTFOUND missing.example',
          extraction: 'not-applicable',
        },
        urls: [],
        warning: `${url}: getaddrinfo ENOTFOUND missing.example`,
      }),
    },
  )

  assert.equal(report.pages.length, 0)
  assert.equal(report.requests.length, 1)
  const failedRequest = report.requests[0]
  assert.ok(failedRequest?.outcome === 'failure')
  assert.equal(failedRequest.failureKind, 'dns')
  assert.equal(report.summary.failedUrls, 1)
  assert.equal(report.summary.statusErrors, 0)
  assert.deepEqual(report.summary.byStatus, {})
  assert.equal(report.summary.attemptedRequests, 1)
  assert.equal(report.summary.responseRequests, 0)
  assert.equal(report.summary.failedRequests, 1)
  assert.equal(report.summary.requestByStatus['no-response'], 1)
  assert.equal(report.status, 'failed')
  assert.deepEqual(
    report.issues.map((item) => [item.ruleId, item.url]),
    [['connection_error', url]],
  )
})

test('crawlSite deduplicates redirected and directly requested documents', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/old') {
      res.statusCode = 301
      res.setHeader('location', '/new')
      res.end()
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      '<title>New</title><link rel="canonical" href="/new"><h1>New</h1><p>Unique destination copy.</p>',
    )
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/new`,
      mode: 'list',
      urls: [`${fixture.baseUrl}/old`, `${fixture.baseUrl}/new`],
      useSitemap: false,
      maxPages: 2,
      concurrency: 2,
    })

    assert.equal(report.requests.length, 2)
    assert.equal(report.pages.length, 1)
    assert.equal(report.pages[0]?.url, `${fixture.baseUrl}/new`)
    assert.deepEqual(
      report.issues
        .filter((item) => item.ruleId === 'redirected_url')
        .map((item) => item.url),
      [`${fixture.baseUrl}/old`],
    )
    assert.equal(
      report.issues.some((item) => item.ruleId === 'title_duplicate'),
      false,
    )
    assert.equal(
      report.issues.some((item) => item.ruleId === 'duplicate_content'),
      false,
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite prefers direct destination evidence independently of completion order', async () => {
  const run = async (oldDelayMs: number, directDelayMs: number) =>
    crawlSite(
      {
        url: 'https://example.com/',
        mode: 'site',
        useSitemap: false,
        maxDepth: 2,
        maxPages: 10,
        concurrency: 2,
      },
      {
        fetch: async () =>
          new Response('not found', {
            status: 404,
            headers: { 'content-type': 'text/plain' },
          }),
        fetchPage: async (url) => {
          const pathname = new URL(url).pathname
          if (pathname === '/') {
            return {
              page: crawlPageSnapshot(url),
              urls: ['https://example.com/old', 'https://example.com/new'],
            }
          }
          if (pathname === '/old' || pathname === '/new') {
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                pathname === '/old' ? oldDelayMs : directDelayMs,
              ),
            )
            const finalUrl = 'https://example.com/new'
            return {
              page: crawlPageSnapshot(finalUrl),
              urls: [
                pathname === '/old'
                  ? 'https://example.com/child-a'
                  : 'https://example.com/child-b',
              ],
            }
          }
          return { page: crawlPageSnapshot(url), urls: [] }
        },
      },
    )

  const oldFirst = await run(1, 20)
  const directFirst = await run(20, 1)
  const snapshot = (report: Awaited<ReturnType<typeof crawlSite>>) => ({
    pages: report.pages.map((page) => ({
      url: page.url,
      depth: page.crawlDepth,
      inlinks: page.internalInlinkCount,
      outgoing: page.outgoingInternalCount,
      links: page.sampleInternalLinks,
    })),
    requests: report.requests.map((request) => request.requestedUrl),
    observedInternalLinks: report.summary.observedInternalLinks,
    discoveredUrls: report.summary.discoveredUrls,
  })

  assert.deepEqual(snapshot(oldFirst), snapshot(directFirst))
  assert.deepEqual(
    oldFirst.pages.map((page) => new URL(page.url).pathname),
    ['/', '/child-a', '/child-b', '/new'],
  )
  assert.equal(
    oldFirst.pages.find((page) => page.url.endsWith('/new'))?.crawlDepth,
    1,
  )
  assert.deepEqual(
    oldFirst.pages.find((page) => page.url.endsWith('/new'))
      ?.sampleInternalLinks,
    ['https://example.com/child-b'],
  )
  assert.equal(oldFirst.summary.observedInternalLinks, 3)
})

test('crawlSite counts links to a fetched redirect destination', async () => {
  const report = await crawlSite(
    {
      url: 'https://example.com/',
      mode: 'site',
      useSitemap: false,
      maxDepth: 2,
      maxPages: 10,
      concurrency: 2,
    },
    {
      fetch: async () =>
        new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => {
        if (new URL(url).pathname === '/') {
          return {
            page: crawlPageSnapshot(url),
            urls: ['https://example.com/old'],
          }
        }
        return {
          page: crawlPageSnapshot('https://example.com/new'),
          urls: [],
        }
      },
    },
  )

  const destination = report.pages.find((page) => page.url.endsWith('/new'))
  assert.equal(destination?.crawlDepth, 1)
  assert.equal(destination?.internalInlinkCount, 1)
  assert.equal(
    report.issues.some(
      (issue) =>
        issue.ruleId === 'orphan_page' &&
        issue.url === 'https://example.com/new',
    ),
    false,
  )
})

test('crawlSite keeps non-HTML responses out of HTML audits', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'application/json')
    res.setHeader('x-robots-tag', 'noindex')
    res.setHeader('link', `<${fixture.baseUrl}/api-source>; rel="canonical"`)
    res.end('{"ok":true}')
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/api`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
    })

    assert.equal(report.pages[0]?.contentType, 'application/json')
    assert.equal(report.pages[0]?.canonical, `${fixture.baseUrl}/api-source`)
    assert.equal(report.pages[0]?.canonicalStatus, 'single')
    assert.equal(
      report.pages[0]?.canonicalCandidates?.[0]?.source,
      'http-header',
    )
    assert.equal(report.pages[0]?.extractionStatus, 'not-applicable')
    assert.equal(report.requests[0]?.extraction, 'not-applicable')
    assert.deepEqual(
      report.issues.map((item) => item.ruleId),
      ['http_not_secure', 'x_robots_noindex', 'soft_404'],
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite applies repeated robots and googlebot restrictions', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html><head>
      <title>Robots directives fixture page</title>
      <meta name="robots" content="index, follow">
      <meta name="googlebot" content="none">
      <meta name="description" content="A useful description for the robots directives fixture page.">
      <link rel="canonical" href="${fixture.baseUrl}/robots-meta">
    </head><body><main><h1>Robots directives</h1><p>Useful content.</p></main></body></html>`)
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/robots-meta`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
    })

    assert.equal(report.pages[0]?.declaredIndexability, 'noindex')
    assert.equal(report.pages[0]?.indexable, false)
    assert.deepEqual(
      report.issues
        .filter((issue) => ['noindex', 'nofollow'].includes(issue.ruleId))
        .map((issue) => issue.ruleId),
      ['noindex', 'nofollow'],
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite keeps robots server failures unknown', async () => {
  let pageRequests = 0
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.statusCode = 503
      res.setHeader('content-type', 'text/plain')
      res.end('temporarily unavailable')
      return
    }
    if (req.url === '/robots-outage') pageRequests += 1
    res.setHeader('content-type', 'text/html')
    res.end(
      '<title>Robots outage fixture</title><h1>Robots outage</h1><p>Useful page content.</p>',
    )
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/robots-outage`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
      refresh: true,
    })

    assert.equal(report.ai?.robotsTxt?.availability, 'unreachable')
    assert.equal(report.ai?.robotsTxt?.status, 503)
    assert.equal(pageRequests, 0)
    assert.equal(report.pages.length, 0)
    assert.equal(report.status, 'partial')
    assert.equal(report.requests[0]?.outcome, 'skipped')
    assert.equal(
      report.requests[0]?.outcome === 'skipped'
        ? report.requests[0].reason
        : undefined,
      'robots-deferred',
    )
    assert.match(report.warnings.join('\n'), /crawl deferred.*robots\.txt/i)
    assert.ok(
      report.ai?.robotsTxt?.botAccess.every((bot) => bot.allowed === null),
    )
    assert.equal(
      report.issues.some((issue) => issue.ruleId === 'robots_blocked'),
      false,
    )
    const readiness = aiReadiness(report)
    assert.equal(readiness.dataStatus, 'partial')
    assert.equal(
      readiness.checks.find((check) => check.id === 'robots-ai-bots')?.status,
      'unknown',
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite keeps page evidence when link and canonical URLs are malformed', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html><head>
      <title>Malformed URL fixture page</title>
      <meta name="description" content="A valid description that must survive malformed URL attributes.">
      <link rel="canonical" href="http://[::1">
    </head><body><main>
      <h1>Malformed URL fixture</h1>
      <a href="http://[::1">Broken link</a>
      <a href="/working">Working link</a>
      <p>Useful content that should remain in the crawl evidence.</p>
    </main></body></html>`)
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/malformed`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
    })

    const page = report.pages[0]
    assert.equal(page?.extractionStatus, 'complete')
    assert.equal(page?.title, 'Malformed URL fixture page')
    assert.equal(page?.h1, 'Malformed URL fixture')
    assert.equal(page?.canonical, undefined)
    assert.equal(page?.canonicalRaw, 'http://[::1')
    assert.deepEqual(page?.sampleInternalLinks, [`${fixture.baseUrl}/working`])
    assert.match(page?.warnings?.join(' ') ?? '', /malformed link URL/)
    assert.match(page?.warnings?.join(' ') ?? '', /malformed canonical URL/)
  } finally {
    await fixture.close()
  }
})

test('crawlSite exposes live non-self canonical state once', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      '<title>Canonical test page for search</title><meta name="description" content="A canonical test page with enough useful description text for validation."><link rel="canonical" href="/preferred"><h1>Canonical test</h1>',
    )
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/canonicalized`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
    })

    assert.equal(report.pages[0]?.declaredIndexability, 'canonical-hint-other')
    assert.equal(report.pages[0]?.indexable, true)
    assert.deepEqual(
      report.issues
        .filter((item) =>
          ['canonicalized_page', 'canonical_mismatch'].includes(item.ruleId),
        )
        .map((item) => item.ruleId),
      ['canonicalized_page'],
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite recognizes supported Microdata without JSON-LD', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html><head>
      <title>Microdata product</title>
      <meta name="description" content="A useful product description for the Microdata fixture.">
      <link rel="canonical" href="${fixture.baseUrl}/microdata">
    </head><body><main itemscope itemtype="https://schema.org/Product">
      <h1 itemprop="name">Microdata product</h1>
      <p itemprop="description">A useful product description with enough visible content for the crawler.</p>
    </main></body></html>`)
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/microdata`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
      refresh: true,
    })

    assert.deepEqual(report.pages[0]?.schemaTypes, ['Product'])
    assert.deepEqual(report.pages[0]?.structuredDataFormats, ['microdata'])
    assert.equal(report.pages[0]?.geo?.structuredData, true)
  } finally {
    await fixture.close()
  }
})

test('crawlSite preserves conflicting HTML and HTTP canonical evidence', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.setHeader('link', `<${fixture.baseUrl}/header>; rel="canonical"`)
    res.end(`<!doctype html><html><head>
      <title>Canonical conflict</title>
      <meta name="description" content="A useful canonical conflict fixture description.">
      <link rel="canonical" href="${fixture.baseUrl}/html">
    </head><body><main><h1>Canonical conflict</h1></main></body></html>`)
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/conflict`,
      mode: 'page',
      useSitemap: false,
      maxPages: 1,
      refresh: true,
    })
    const page = report.pages[0]

    assert.equal(page?.canonical, undefined)
    assert.equal(page?.canonicalStatus, 'conflicting')
    assert.equal(page?.declaredIndexability, 'canonical-conflict')
    assert.deepEqual(
      page?.canonicalCandidates?.map(({ source, resolved }) => ({
        source,
        resolved,
      })),
      [
        { source: 'html-head', resolved: `${fixture.baseUrl}/html` },
        { source: 'http-header', resolved: `${fixture.baseUrl}/header` },
      ],
    )
    assert.deepEqual(
      report.issues
        .filter((issue) => issue.category === 'canonical')
        .map((issue) => issue.ruleId),
      ['canonical_conflict'],
    )
  } finally {
    await fixture.close()
  }
})
