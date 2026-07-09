import assert from 'node:assert/strict'
import test from 'node:test'
import type { PseoAuditReport } from './audit.js'
import { renderPseoMarkdown } from './markdown.js'
import { pseoPresentation } from './presentation.js'

test('pseoPresentation exposes summary table for empty generic fixture', () => {
  const report: PseoAuditReport = {
    schemaVersion: 1,
    methodology: 'pseo-audit-v2',
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-04T10:00:00.000Z',
    rangeDays: 28,
    range: { startDate: '2026-05-04', endDate: '2026-05-31' },
    dataStatus: 'empty',
    source: {
      searchAnalytics: {
        pageRows: 0,
        queryPageRows: 0,
        maxRowsPerRequest: 50_000,
        pageRowsPossiblyTruncated: false,
        queryPageRowsPossiblyTruncated: false,
        dimensions: { page: ['page'], queryPage: ['query', 'page'] },
        searchType: 'web',
        dataState: 'final',
        aggregation: 'auto',
      },
      sitemaps: {
        requested: 0,
        discoveredUrls: 0,
        maxUrlsPerSitemap: 50_000,
      },
    },
    selection: {
      inputQueryPageRows: 0,
      invalidQueryPageRows: 0,
      lowActionabilityRows: 0,
      brandRows: 0,
      retainedQueryPageRows: 0,
      inputPageRows: 0,
      invalidPageRows: 0,
      retainedPageRows: 0,
      discoveredUrls: 0,
      eligibleTemplates: 0,
      returnedTemplates: 0,
      templateLimit: 25,
      minimumTemplateUrls: 3,
      minimumTemplateShare: 0,
      minimumTemplateImpressions: 0,
      templateOrder: 'page-impressions-clicks-url-count-signature-v1',
    },
    summary: {
      sitemapUrls: 0,
      gscPages: 0,
      templates: 0,
      clicks: 0,
      impressions: 0,
      crawlAttempts: 0,
      inspectedUrls: 0,
      crawledUrls: 0,
      crawlFailures: 0,
      inspectionAttempts: 0,
      inspectionFailures: 0,
    },
    caveats: ['No sitemap URLs passed.'],
    templates: [],
    warnings: [],
  }

  const presentation = pseoPresentation(report)
  const markdown = renderPseoMarkdown(report)

  assert.equal(presentation.tables[0]?.id, 'pseo_summary')
  assert.equal(presentation.tables[1]?.id, 'pseo_templates')
  assert.deepEqual(presentation.charts, [])
  assert.match(markdown, /^# pSEO audit: sc-domain:example\.com/)
  assert.match(markdown, /No sitemap URLs passed\./)
})
