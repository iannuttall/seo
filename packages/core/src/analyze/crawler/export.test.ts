import assert from 'node:assert/strict'
import test from 'node:test'
import {
  renderCrawlCsv,
  renderCrawlHtml,
  renderCrawlJunit,
  renderCrawlMarkdownTickets,
  renderCrawlPagesCsv,
  renderCrawlPretty,
} from './export.js'
import { createCrawlReport } from './report.js'

test('crawl exporters render CSV, HTML, and plain text reports', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      {
        url: 'https://example.com/',
        finalUrl: 'https://example.com/',
        status: 200,
        indexable: true,
        wordCount: 100,
        contentExtraction: {
          requested: 'defuddle',
          used: 'defuddle',
          fallback: false,
          wordCountSource: 'defuddle',
          baseUrl: 'https://example.com/',
          extractorType: 'article',
        },
        contentHash: 'hash',
        outgoingInternalCount: 1,
        outgoingExternalCount: 2,
        imagesTotal: 3,
        imagesMissingAlt: 1,
        schemaTypes: ['Article'],
        searchMetrics: {
          clicks: 12,
          impressions: 100,
          ctr: 0.12,
          position: 4.2,
        },
      },
    ],
    issues: [
      {
        ruleId: 'missing_title',
        title: 'Missing title',
        category: 'metadata',
        severity: 'high',
        url: 'https://example.com/',
        searchMetrics: {
          clicks: 12,
          impressions: 100,
          ctr: 0.12,
          position: 4.2,
        },
      },
      {
        ruleId: 'hsts_missing',
        title: 'HSTS header missing',
        category: 'security',
        severity: 'low',
        url: 'https://example.com/',
      },
    ],
    warnings: ['External link checks were skipped.'],
    caveats: ['Stopped after reaching maxPages (1).'],
  })

  const csv = renderCrawlCsv(report)
  assert.match(csv, /^rule_id,title,category,severity,url/)
  assert.match(csv, /missing_title,Missing title,metadata,high/)

  const pagesCsv = renderCrawlPagesCsv(report)
  assert.match(pagesCsv, /^url,final_url,status,indexable,title/)
  assert.match(pagesCsv, /internal_inlinks,internal_authority_score/)
  assert.doesNotMatch(pagesCsv, /seo_score|geo_score/)
  assert.match(
    pagesCsv,
    /content_extractor,content_extractor_type,content_extraction_fallback,word_count_source/,
  )
  assert.match(pagesCsv, /defuddle,article,false,defuddle/)
  assert.match(
    pagesCsv,
    /https:\/\/example.com\/,https:\/\/example.com\/,200,true/,
  )

  const pretty = renderCrawlPretty(report)
  assert.match(pretty, /Crawl report for https:\/\/example.com\//)
  assert.match(
    pretty,
    /Documents: 1 retained; request evidence unavailable for this legacy report, 1 URLs discovered, 0 failed, 0 skipped/,
  )
  assert.doesNotMatch(pretty, /Scores: /)
  assert.match(pretty, /Prioritised fixes/)
  assert.match(pretty, /Review observations \(check before scheduling work\)/)
  assert.match(pretty, /HSTS header missing/)
  assert.match(pretty, /Next commands/)
  assert.match(pretty, /- seo crawl https:\/\/example.com\/ --json/)

  const html = renderCrawlHtml(report)
  assert.match(html, /<!doctype html>/)
  assert.match(html, /Missing title/)
  assert.match(html, /Observed internal links/)
  assert.match(html, /Stopped after reaching maxPages/)
  assert.match(html, /External link checks were skipped/)
  assert.match(html, /seo crawl https:\/\/example.com\//)

  const markdown = renderCrawlMarkdownTickets(report)
  assert.match(markdown, /# Crawl Implementation Tickets/)
  assert.match(markdown, /## Caveats/)
  assert.match(markdown, /Stopped after reaching maxPages/)
  assert.match(markdown, /- \[ \] Fix 1 affected URL/)
  assert.match(markdown, /- Command: seo crawl https:\/\/example.com\//)
  assert.match(markdown, /## Review observations/)
  assert.match(markdown, /HSTS header missing/)
})

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
