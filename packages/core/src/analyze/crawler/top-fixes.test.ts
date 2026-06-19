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
  assert.equal(fixes[0]?.scoreFactors.searchVisibleUrls, 1)
  assert.match(fixes[0]?.whyThisRanks ?? '', /GSC visibility/)
  assert.match(fixes[0]?.whyThisRanks ?? '', /GA4 adds 120 sessions/)
  assert.match(fixes[0]?.howToFix ?? '', /Restore the page/)
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
