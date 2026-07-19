import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { crawlSite } from './site-crawl.js'
import { withServer } from './site-crawl.test-fixtures.js'

function aliasedPage(url: string): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    responseTimeMs: 20,
    title: 'Crawl completeness fixture',
    metaDescription: 'Crawl completeness fixture.',
    h1: 'Crawl completeness fixture',
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    indexable: true,
    wordCount: 10,
    contentHash: 'fixture',
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: false,
      hasDate: false,
      questionHeadings: 0,
      structuredBlocks: 0,
      answerable: false,
    },
  }
}

test('crawlSite seeds every same-origin sitemap declared in robots.txt', async () => {
  let defaultSitemapRequests = 0
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end(
        `User-agent: *\nAllow: /\nSitemap: ${fixture.baseUrl}/content-a.xml\nSitemap: ${fixture.baseUrl}/content-b.xml\n`,
      )
      return
    }
    if (req.url === '/content-a.xml' || req.url === '/content-b.xml') {
      const page = req.url === '/content-a.xml' ? 'from-a' : 'from-b'
      res.setHeader('content-type', 'application/xml')
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>${fixture.baseUrl}/${page}</loc></url>
      </urlset>`)
      return
    }
    if (req.url === '/sitemap.xml') {
      defaultSitemapRequests += 1
      res.statusCode = 500
      res.end('The default sitemap must not be fetched.')
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
      checkExternal: false,
      refresh: true,
    })

    assert.equal(defaultSitemapRequests, 0)
    assert.deepEqual(
      report.pages.map((page) => new URL(page.url).pathname),
      ['/from-a', '/from-b'],
    )
    assert.equal(report.sitemapDiscovery?.dataStatus, 'complete')
    assert.equal(report.sitemapDiscovery?.urlsReturned, 2)
    assert.deepEqual(
      report.sitemapDiscovery?.roots.map(({ documents, ...root }) => root),
      [
        {
          url: `${fixture.baseUrl}/content-a.xml`,
          source: 'robots-txt',
          dataStatus: 'complete',
          urlsReturned: 1,
          sitemapsFetched: 1,
          lastmods: {
            trust: 'unverified',
            observed: 0,
            parseable: 0,
            malformed: { count: 0, samples: [] },
            future: { count: 0, samples: [] },
          },
          possiblyTruncated: false,
          warnings: [],
        },
        {
          url: `${fixture.baseUrl}/content-b.xml`,
          source: 'robots-txt',
          dataStatus: 'complete',
          urlsReturned: 1,
          sitemapsFetched: 1,
          lastmods: {
            trust: 'unverified',
            observed: 0,
            parseable: 0,
            malformed: { count: 0, samples: [] },
            future: { count: 0, samples: [] },
          },
          possiblyTruncated: false,
          warnings: [],
        },
      ],
    )
    assert.deepEqual(
      report.sitemapDiscovery?.roots.flatMap((root) =>
        root.documents.map((document) => ({
          url: document.url,
          dataStatus: document.dataStatus,
          status: document.status,
          contentType: document.contentType,
          compression: document.compression,
          root: document.root,
        })),
      ),
      [
        {
          url: `${fixture.baseUrl}/content-a.xml`,
          dataStatus: 'complete',
          status: 200,
          contentType: 'application/xml',
          compression: 'none',
          root: 'urlset',
        },
        {
          url: `${fixture.baseUrl}/content-b.xml`,
          dataStatus: 'complete',
          status: 200,
          contentType: 'application/xml',
          compression: 'none',
          root: 'urlset',
        },
      ],
    )
  } finally {
    await fixture.close()
  }
})

test('crawlSite falls back after declared sitemaps return no URLs', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end(
        `User-agent: *\nAllow: /\nSitemap: ${fixture.baseUrl}/missing-sitemap.xml\n`,
      )
      return
    }
    if (req.url === '/missing-sitemap.xml') {
      res.statusCode = 404
      res.end('missing')
      return
    }
    if (req.url === '/sitemap.xml') {
      res.setHeader('content-type', 'application/xml')
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>${fixture.baseUrl}/from-fallback</loc></url>
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
      checkExternal: false,
      refresh: true,
    })

    assert.equal(report.status, 'partial')
    assert.deepEqual(
      report.pages.map((page) => new URL(page.url).pathname),
      ['/from-fallback'],
    )
    assert.equal(report.sitemapDiscovery?.dataStatus, 'partial')
    assert.deepEqual(
      report.sitemapDiscovery?.roots.map((root) => [
        root.url,
        root.source,
        root.dataStatus,
      ]),
      [
        [`${fixture.baseUrl}/missing-sitemap.xml`, 'robots-txt', 'unavailable'],
        [`${fixture.baseUrl}/sitemap.xml`, 'default-path', 'complete'],
      ],
    )
    assert.match(report.warnings.join('\n'), /also tried \/sitemap\.xml/)
  } finally {
    await fixture.close()
  }
})

test('crawlSite keeps a missing optional default sitemap as unavailable evidence', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\\nAllow: /\\n')
      return
    }
    if (req.url === '/sitemap.xml') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain')
      res.end('missing')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end('<title>Home</title><h1>Home</h1>')
  })

  try {
    const report = await crawlSite({
      url: fixture.baseUrl,
      maxPages: 1,
      concurrency: 1,
      checkExternal: false,
      refresh: true,
    })

    assert.equal(report.status, 'completed')
    assert.equal(report.sitemapDiscovery?.dataStatus, 'unavailable')
    assert.deepEqual(report.sitemapDiscovery?.roots[0]?.documents, [
      {
        url: `${fixture.baseUrl}/sitemap.xml`,
        dataStatus: 'unavailable',
        status: 404,
        contentType: 'text/plain',
        compression: 'none',
        warning: `Sitemap fetch failed for ${fixture.baseUrl}/sitemap.xml: HTTP 404.`,
      },
    ])
  } finally {
    await fixture.close()
  }
})

test('crawlSite stays partial when queue safety excludes URLs before the page limit', async () => {
  const root = 'https://example.com/'
  const report = await crawlSite(
    {
      url: root,
      useSitemap: false,
      checkExternal: false,
      maxPages: 3,
      maxDepth: 2,
      concurrency: 1,
    },
    {
      fetch: async () =>
        new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => ({
        urls:
          url === root
            ? Array.from(
                { length: 40 },
                (_, index) => `https://example.com/page-${index}`,
              )
            : [],
        page: aliasedPage(root),
      }),
    },
  )

  assert.equal(report.summary.totalPages, 1)
  assert.equal(report.summary.pageLimitReached, false)
  assert.equal(report.status, 'partial')
  assert.match(
    report.caveats.join('\n'),
    /Left 26 unique eligible same-origin URLs unqueued to keep this crawl bounded/,
  )
})
