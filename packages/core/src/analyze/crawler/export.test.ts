import assert from 'node:assert/strict'
import test from 'node:test'
import {
  renderCrawlCsv,
  renderCrawlHtml,
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
  assert.match(pagesCsv, /seo_score,geo_score/)
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
  assert.match(pretty, /Pages: 1 crawled, 1 discovered, 0 skipped/)
  assert.match(pretty, /Scores: /)
  assert.match(pretty, /Next commands/)
  assert.match(pretty, /- seo crawl https:\/\/example.com\/ --json/)

  const html = renderCrawlHtml(report)
  assert.match(html, /<!doctype html>/)
  assert.match(html, /Missing title/)
  assert.match(html, /Verified links/)
  assert.match(html, /Stopped after reaching maxPages/)
  assert.match(html, /External link checks were skipped/)
  assert.match(html, /seo crawl https:\/\/example.com\//)

  const markdown = renderCrawlMarkdownTickets(report)
  assert.match(markdown, /# Crawl Implementation Tickets/)
  assert.match(markdown, /## Caveats/)
  assert.match(markdown, /Stopped after reaching maxPages/)
  assert.match(markdown, /- \[ \] Fix 1 affected URL/)
  assert.match(markdown, /- Command: seo crawl https:\/\/example.com\//)
})
