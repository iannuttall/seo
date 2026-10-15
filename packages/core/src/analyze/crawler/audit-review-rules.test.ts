import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditCrawlPages } from './audit.js'
import { crawlPage as page } from './audit.test-fixtures.js'

test('auditCrawlPages does not infer near-empty content without complete extraction', () => {
  for (const input of [
    { extractionStatus: 'failed' as const, wordCount: 3 },
    { extractionStatus: 'not-applicable' as const, wordCount: 3 },
    { extractionStatus: 'complete' as const, wordCount: 10 },
    {
      extractionStatus: 'complete' as const,
      wordCount: 3,
      indexable: false,
      metaRobots: 'noindex',
    },
  ]) {
    const issues = auditCrawlPages([page(input)])
    assert.equal(
      issues.some((issue) => issue.ruleId === 'near_empty_content'),
      false,
      JSON.stringify(input),
    )
  }
})

test('auditCrawlPages keeps invalid JSON-LD separate from the missing observation', () => {
  const issues = auditCrawlPages([
    page({
      structuredDataFormats: [],
      schemaTypes: [],
      invalidJsonLdCount: 1,
      invalidJsonLdSamples: [{ snippet: '{ broken', error: 'Unexpected end' }],
    }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
  assert.equal(
    issues.some((issue) => issue.ruleId === 'jsonld_invalid'),
    true,
  )
})

test('auditCrawlPages returns deterministic issue ordering', () => {
  const pages = [
    page({
      url: 'https://example.com/multiple',
      h1Count: 2,
      structuredDataFormats: [],
      schemaTypes: [],
    }),
    page({
      url: 'https://example.com/missing',
      h1: undefined,
      h1Count: 0,
      structuredDataFormats: [],
      schemaTypes: [],
    }),
  ]

  const first = auditCrawlPages(pages)
  const second = auditCrawlPages(pages)

  assert.deepEqual(first, second)
  assert.ok(first.length > 0)
})
