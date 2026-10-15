import assert from 'node:assert/strict'
import test from 'node:test'
import { renderCrawlJunit } from './export.js'
import { createCrawlReport } from './report.js'

test('JUnit output maps each health request to a CI test case', () => {
  const report = createCrawlReport({
    config: {
      url: 'https://example.com/',
      mode: 'sitemap',
      strategy: 'health',
      sitemapUrl: 'https://example.com/sitemap.xml',
    },
    sitemapDiscovery: {
      dataStatus: 'complete',
      urlsReturned: 2,
      roots: [
        {
          url: 'https://example.com/sitemap.xml',
          source: 'explicit',
          dataStatus: 'complete',
          urlsReturned: 2,
          sitemapsFetched: 1,
          lastmods: {
            trust: 'unverified',
            observed: 0,
            parseable: 0,
            malformed: { count: 0, samples: [] },
            future: { count: 0, samples: [] },
          },
          documents: [
            {
              url: 'https://example.com/sitemap.xml',
              dataStatus: 'complete',
              status: 200,
              compression: 'none',
              root: 'urlset',
            },
          ],
          possiblyTruncated: false,
          warnings: [],
        },
      ],
    },
    requests: [
      {
        requestedUrl: 'https://example.com/good?x=1&y=2',
        outcome: 'response',
        finalUrl: 'https://example.com/good?x=1&y=2',
        status: 200,
        robotsTxt: {
          url: 'https://example.com/robots.txt',
          allowed: true,
          availability: 'available',
          status: 200,
        },
        extraction: 'not-applicable',
      },
      {
        requestedUrl: 'https://example.com/missing',
        outcome: 'response',
        finalUrl: 'https://example.com/missing',
        status: 404,
        extraction: 'not-applicable',
      },
    ],
    pages: [
      {
        url: 'https://example.com/missing',
        finalUrl: 'https://example.com/missing',
        status: 404,
        auditScope: 'status',
        contentAuditAllowed: false,
        indexable: false,
        extractionStatus: 'not-applicable',
        wordCount: 0,
        contentHash: '',
        outgoingInternalCount: 0,
      },
    ],
  })

  const junit = renderCrawlJunit(report)
  assert.match(junit, /tests="3" failures="1"/)
  assert.match(junit, /classname="seo\.sitemap-document"/)
  assert.match(junit, /name="https:\/\/example\.com\/good\?x=1&amp;y=2"/)
  assert.match(junit, /Client error/)
  assert.match(junit, /crawler\.userAgent/)
  assert.match(junit, /robotsAllowed=true/)
  assert.match(junit, /robotsAvailability=available/)
})

test('JUnit output fails visibly when the sitemap cannot be read', () => {
  const report = createCrawlReport({
    config: {
      url: 'https://example.com/',
      mode: 'sitemap',
      strategy: 'health',
      sitemapUrl: 'https://example.com/sitemap.xml',
    },
    sitemapDiscovery: {
      dataStatus: 'unavailable',
      urlsReturned: 0,
      roots: [
        {
          url: 'https://example.com/sitemap.xml',
          source: 'explicit',
          dataStatus: 'unavailable',
          urlsReturned: 0,
          sitemapsFetched: 0,
          lastmods: {
            trust: 'unverified',
            observed: 0,
            parseable: 0,
            malformed: { count: 0, samples: [] },
            future: { count: 0, samples: [] },
          },
          documents: [],
          possiblyTruncated: false,
          warnings: ['Sitemap returned HTTP 404.'],
        },
      ],
    },
    status: 'failed',
  })

  const junit = renderCrawlJunit(report)
  assert.match(junit, /tests="1" failures="1"/)
  assert.match(junit, /Sitemap returned HTTP 404/)
})
