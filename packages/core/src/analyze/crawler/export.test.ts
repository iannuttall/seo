import assert from 'node:assert/strict'
import test from 'node:test'
import {
  renderCrawlCsv,
  renderCrawlHtml,
  renderCrawlMarkdownTickets,
  renderCrawlPretty,
} from './export.js'
import { createCrawlReport } from './report.js'

test('crawl exporters render CSV, HTML, and plain text reports', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
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
    ],
  })

  const csv = renderCrawlCsv(report)
  assert.match(csv, /^rule_id,title,category,severity,url/)
  assert.match(csv, /missing_title,Missing title,metadata,high/)

  const pretty = renderCrawlPretty(report)
  assert.match(pretty, /Crawl report for https:\/\/example.com\//)
  assert.match(pretty, /Verify:/)
  assert.match(pretty, /Command: seo crawl https:\/\/example.com\//)

  const html = renderCrawlHtml(report)
  assert.match(html, /<!doctype html>/)
  assert.match(html, /Missing title/)
  assert.match(html, /seo crawl https:\/\/example.com\//)

  const markdown = renderCrawlMarkdownTickets(report)
  assert.match(markdown, /# Crawl Implementation Tickets/)
  assert.match(markdown, /- \[ \] Fix 1 affected URL/)
  assert.match(markdown, /- Command: seo crawl https:\/\/example.com\//)
})
