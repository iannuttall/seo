import assert from 'node:assert/strict'
import test from 'node:test'
import type { PseoAuditReport } from './audit.js'
import { renderPseoMarkdown } from './markdown.js'
import { pseoPresentation } from './presentation.js'

test('pseoPresentation exposes summary table for empty generic fixture', () => {
  const report: PseoAuditReport = {
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-04T10:00:00.000Z',
    rangeDays: 28,
    summary: {
      sitemapUrls: 0,
      gscPages: 0,
      templates: 0,
      clicks: 0,
      impressions: 0,
      inspectedUrls: 0,
      crawledUrls: 0,
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
