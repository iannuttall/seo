import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listRules } from '../../rules.js'
import { createCrawlReport } from './report.js'
import {
  crawlerJsonSchemas,
  crawlerSchemas,
  crawlReportSchema,
  crawlTopFixSchema,
} from './schemas.js'
import { topFixes } from './top-fixes.js'

test('crawler schemas validate report, page, rule, issue group, and top fix outputs', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    generatedAt: '2026-06-19T00:00:00.000Z',
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
        },
        contentHash: 'hash',
        outgoingInternalCount: 0,
      },
    ],
    issues: [
      {
        ruleId: 'missing_title',
        title: 'Title missing',
        category: 'metadata',
        severity: 'high',
        url: 'https://example.com/',
      },
    ],
  })
  const fix = topFixes(report)[0]

  assert.doesNotThrow(() => crawlReportSchema.parse(report))
  assert.doesNotThrow(() => crawlerSchemas.pageSnapshot.parse(report.pages[0]))
  assert.equal(
    crawlerSchemas.pageSnapshot.parse(report.pages[0]).contentExtraction?.used,
    'defuddle',
  )
  assert.doesNotThrow(() =>
    crawlerSchemas.issueGroup.parse(report.issueGroups[0]),
  )
  assert.doesNotThrow(() => crawlerSchemas.ruleInfo.parse(listRules()[0]))
  assert.ok(fix)
  assert.doesNotThrow(() => crawlTopFixSchema.parse(fix))
})

test('crawler JSON schemas expose deterministic object contracts', () => {
  assert.equal(crawlerJsonSchemas.crawlReport.type, 'object')
  assert.equal(crawlerJsonSchemas.pageSnapshot.type, 'object')
  assert.equal(crawlerJsonSchemas.ruleInfo.type, 'object')
  assert.ok(crawlerJsonSchemas.crawlReport.properties?.summary)
  assert.ok(crawlerJsonSchemas.topFix.properties?.scoreFactors)
})
