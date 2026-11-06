import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response, type ResponseInit } from 'undici'
import { crawlSite } from './site-crawl.js'
import { withServer } from './site-crawl.test-fixtures.js'
import {
  checkSites,
  type SiteFactsDependencies,
  type SiteFactsRow,
} from './site-facts.js'

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
        (item) =>
          item.url === `${fixture.baseUrl}/old` &&
          item !== issue &&
          item.category !== 'agents',
      ),
      false,
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite follows meta refreshes without auditing the redirect stub', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html')
    if (req.url === '/') {
      res.end(
        '<!doctype html><meta http-equiv="refresh" content="0;url=/en/getting-started/">',
      )
      return
    }
    if (req.url === '/en/getting-started/') {
      res.end(`<!doctype html><html lang="en"><head>
        <title>Getting started documentation</title>
        <meta name="description" content="Start using the documentation with this practical introduction.">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="canonical" href="/en/getting-started/">
      </head><body><main><h1>Getting started</h1><p>Useful documentation content for the target page.</p></main></body></html>`)
      return
    }
    res.statusCode = 404
    res.end('Not found')
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/`,
      mode: 'site',
      useSitemap: false,
      checkExternal: false,
      maxPages: 2,
      concurrency: 1,
    })
    const redirectPage = report.pages.find(
      (page) => page.url === `${fixture.baseUrl}/`,
    )
    const target = `${fixture.baseUrl}/en/getting-started/`
    const redirectIssues = report.issues.filter(
      (issue) =>
        issue.url === `${fixture.baseUrl}/` && issue.category !== 'agents',
    )

    assert.deepEqual(redirectPage?.metaRefresh, {
      targetUrl: target,
      delaySeconds: 0,
    })
    assert.equal(redirectPage?.indexable, false)
    assert.equal(redirectPage?.declaredIndexability, 'meta-refresh')
    assert.equal(
      report.pages.some((page) => page.url === target),
      true,
    )
    assert.deepEqual(
      redirectIssues.map((issue) => issue.ruleId),
      ['redirected_url'],
    )
    assert.deepEqual(redirectIssues[0]?.evidence, {
      requestedUrl: `${fixture.baseUrl}/`,
      finalUrl: target,
      status: 200,
      redirectType: 'meta-refresh',
      delaySeconds: 0,
    })
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
    report.issues
      .filter((item) => item.category !== 'agents')
      .map((item) => [item.ruleId, item.url]),
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

// A site that serves its home page for every path, with a sitemap built
// against a development base URL.
test('crawlSite flags an HTML robots.txt and llms.txt, soft 404s and a localhost sitemap', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/sitemap.xml') {
      res.setHeader('content-type', 'application/xml')
      res.end(
        `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://localhost:8000/</loc></url><url><loc>http://localhost:8000/guide/</loc></url><url><loc>${fixture.baseUrl}/</loc></url></urlset>`,
      )
      return
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<!doctype html><title>Home</title><h1>Home</h1><p>Welcome.</p>')
  })

  try {
    const report = await crawlSite({
      url: `${fixture.baseUrl}/`,
      maxPages: 3,
      concurrency: 1,
      js: 'off',
      checkExternal: false,
    })
    const byRule = (ruleId: string) =>
      report.issues.filter((issue) => issue.ruleId === ruleId)

    assert.equal(byRule('robots_txt_html').length, 1)
    assert.equal(report.ai?.robotsTxt?.exists, false)
    assert.equal(report.ai?.llmsTxt?.servesHtml, true)
    assert.match(byRule('llms_txt_missing')[0]?.detail ?? '', /HTML page/)
    assert.equal(byRule('soft_404').length, 1)
    const offHost = byRule('sitemap_url_off_host')
    assert.equal(offHost.length, 1)
    assert.equal(offHost[0]?.url, `${fixture.baseUrl}/sitemap.xml`)
    assert.deepEqual(report.sitemapDiscovery?.roots[0]?.offHost, {
      count: 2,
      localhost: 2,
      hosts: ['localhost:8000'],
      samples: ['http://localhost:8000/', 'http://localhost:8000/guide/'],
    })
  } finally {
    await fixture.close()
  }
})

test('checkSites keeps failed fetches apart from missing files and reads robots.txt across a host redirect', async () => {
  const fetch = (async (url: string) => {
    const host = new URL(url).hostname
    if (host === 'down.example') {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND down.example'), {
          code: 'ENOTFOUND',
        }),
      })
    }
    const response = (body: string, init: ResponseInit, finalUrl = url) =>
      Object.defineProperty(new Response(body, init), 'url', {
        value: finalUrl,
      })
    if (url === 'https://apex.example/robots.txt') {
      return response(
        'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://www.apex.example/sitemap.xml\n',
        { headers: { 'content-type': 'text/plain' } },
        'https://www.apex.example/robots.txt',
      )
    }
    if (url === 'https://apex.example/') {
      return response('', {
        status: 301,
        headers: { location: 'https://www.apex.example/' },
      })
    }
    if (url === 'https://www.apex.example/') {
      return response(
        '<html><head><title>Apex</title><meta name="robots" content="noindex"><link rel="canonical" href="https://www.apex.example/"></head><body><h1>Apex</h1></body></html>',
        { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noai' } },
      )
    }
    return response('# Apex\n\n- [Docs](https://apex.example/docs)\n', {
      headers: { 'content-type': 'text/plain' },
    })
  }) as unknown as NonNullable<SiteFactsDependencies['fetch']>
  const rows: SiteFactsRow[] = []
  const summary = await checkSites(
    {
      sites: [
        'apex.example',
        'not a site!!',
        'down.example',
        'https://apex.example/blog',
      ],
      onRow: (row) => {
        rows.push(row)
      },
    },
    { fetch },
  )

  assert.deepEqual(
    rows.map((row) => row.input),
    ['apex.example', 'not a site!!', 'down.example'],
  )
  const [apex, invalid, down] = rows
  const bot = (name: string) =>
    apex?.robotsTxt?.botAccess.find((item) => item.userAgent === name)?.allowed
  assert.equal(bot('GPTBot'), false)
  assert.equal(bot('ClaudeBot'), true)
  assert.deepEqual(apex?.robotsTxt?.sitemapUrls, [
    'https://www.apex.example/sitemap.xml',
  ])
  assert.equal(apex?.homepage?.finalUrl, 'https://www.apex.example/')
  assert.equal(apex?.homepage?.title, 'Apex')
  assert.equal(apex?.homepage?.metaRobots, 'noindex')
  assert.equal(apex?.homepage?.xRobotsTag, 'noai')
  assert.equal(apex?.homepage?.indexable, false)
  assert.equal(apex?.llmsTxt?.startsWithH1, true)
  assert.equal(apex?.llmsTxt?.sameSiteLinks, 1)
  assert.equal(invalid?.error, 'Not an http or https site.')
  assert.equal(down?.robotsTxt?.availability, 'unreachable')
  assert.equal(down?.robotsTxt?.errorKind, 'dns')
  assert.equal(down?.homepage?.outcome, 'skipped')
  assert.equal(down?.homepage?.skipReason, 'robots-unknown')
  assert.equal(down?.llmsTxt?.exists, false)
  assert.equal(down?.llmsTxt?.availability, 'unreachable')
  assert.equal(summary.duplicatesRemoved, 1)
  assert.equal(summary.invalid, 1)
  assert.equal(summary.llmsTxt.absent, 0)
  assert.equal(summary.llmsTxt.failed, 1)
})
