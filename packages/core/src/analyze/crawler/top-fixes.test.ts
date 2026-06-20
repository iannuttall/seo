import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCrawlReport } from './report.js'
import { topFixes } from './top-fixes.js'

test('topFixes ranks search-visible errors above generic notices', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      {
        url: 'https://example.com/money',
        finalUrl: 'https://example.com/money',
        status: 404,
        indexable: false,
        wordCount: 0,
        contentHash: 'money',
        outgoingInternalCount: 0,
        searchMetrics: {
          clicks: 40,
          impressions: 1000,
          ctr: 0.04,
          position: 7,
        },
        analytics: {
          sessions: 120,
          totalUsers: 90,
          conversions: 3,
        },
      },
      {
        url: 'https://example.com/about',
        finalUrl: 'https://example.com/about',
        status: 200,
        indexable: true,
        wordCount: 800,
        contentHash: 'about',
        outgoingInternalCount: 2,
      },
    ],
    issues: [
      {
        ruleId: 'og_title_missing',
        title: 'Open Graph title missing',
        category: 'social',
        severity: 'low',
        url: 'https://example.com/about',
      },
      {
        ruleId: 'client_error',
        title: 'Client error',
        category: 'response',
        severity: 'high',
        url: 'https://example.com/money',
      },
    ],
  })

  const fixes = topFixes(report)

  assert.equal(fixes[0]?.ruleId, 'client_error')
  assert.equal(fixes[0]?.scoreFactors.clicks, 40)
  assert.equal(fixes[0]?.scoreFactors.sessions, 120)
  assert.equal(fixes[0]?.scoreFactors.conversions, 3)
  assert.equal(fixes[0]?.scoreFactors.searchVisibleUrls, 1)
  assert.match(fixes[0]?.whyThisRanks ?? '', /GSC visibility/)
  assert.match(
    fixes[0]?.whyThisRanks ?? '',
    /GA4 adds 120 sessions and 3 conversions/,
  )
  assert.match(fixes[0]?.howToFix ?? '', /Restore the page/)
  assert.match(
    fixes[0]?.verification.command ?? '',
    /seo crawl https:\/\/example.com\/ --severity high --max-pages 100/,
  )
  assert.match(fixes[0]?.verification.expected ?? '', /Re-run the crawl/)
})

test('topFixes filters by category, severity, and URL pattern', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    issues: [
      {
        ruleId: 'client_error',
        title: 'Client error',
        category: 'response',
        severity: 'high',
        url: 'https://example.com/broken',
      },
      {
        ruleId: 'missing_meta_description',
        title: 'Meta description missing',
        category: 'metadata',
        severity: 'medium',
        url: 'https://example.com/blog/post',
      },
    ],
  })

  assert.deepEqual(
    topFixes(report, { category: 'metadata' }).map((fix) => fix.ruleId),
    ['missing_meta_description'],
  )
  assert.deepEqual(
    topFixes(report, { severity: 'high' }).map((fix) => fix.ruleId),
    ['client_error'],
  )
  assert.deepEqual(
    topFixes(report, { url: '/blog/*' }).map((fix) => fix.ruleId),
    ['missing_meta_description'],
  )
})

test('topFixes keeps medium fixes above low sitewide noise', () => {
  const pages = Array.from({ length: 500 }, (_, index) => ({
    url: `https://example.com/page-${index}`,
    finalUrl: `https://example.com/page-${index}`,
    status: 200,
    indexable: true,
    wordCount: 500,
    contentHash: `page-${index}`,
    outgoingInternalCount: 2,
    searchMetrics: {
      clicks: 1,
      impressions: 100,
      ctr: 0.01,
      position: 12,
    },
  }))
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages,
    issues: [
      ...pages.map((page) => ({
        ruleId: 'twitter_card_missing' as const,
        title: 'Twitter card missing',
        category: 'social' as const,
        severity: 'low' as const,
        url: page.url,
      })),
      ...pages.slice(0, 300).map((page) => ({
        ruleId: 'geo_no_structured_data' as const,
        title: 'GEO: no machine-readable structure',
        category: 'geo' as const,
        severity: 'medium' as const,
        url: page.url,
      })),
    ],
  })

  const fixes = topFixes(report)

  assert.equal(fixes[0]?.ruleId, 'geo_no_structured_data')
  assert.equal(fixes[1]?.ruleId, 'twitter_card_missing')
})
