import assert from 'node:assert/strict'
import test from 'node:test'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { geoGaps } from './geo-gaps.js'
import { createCrawlReport } from './report.js'

test('geoGaps returns pages with observed GEO issues', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      page('https://example.com/a', false),
      page('https://example.com/b', true),
    ],
    issues: [
      {
        ruleId: 'geo_no_author',
        title: 'GEO: authorship missing',
        category: 'geo',
        severity: 'low',
        url: 'https://example.com/a',
      },
    ],
  })

  const gaps = geoGaps(report)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0]?.url, 'https://example.com/a')
  assert.equal(gaps[0]?.signals.structuredData, false)
  assert.equal(gaps[0]?.issues[0]?.ruleId, 'geo_no_author')
})

function page(url: string, structuredData: boolean): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    responseTimeMs: 10,
    sizeBytes: 1000,
    usedJs: false,
    fetchSource: 'network',
    cacheState: 'miss',
    blocked: false,
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    indexable: true,
    wordCount: 100,
    contentHash: 'hash',
    imagesTotal: 0,
    imagesMissingAlt: 0,
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    sampleInternalLinks: [],
    sampleExternalLinks: [],
    schemaTypes: structuredData ? ['Article'] : [],
    hasDate: false,
    geo: {
      semanticHtml: true,
      structuredData,
      hasAuthor: structuredData,
      hasDate: false,
      questionHeadings: 0,
      structuredBlocks: 1,
      answerable: true,
    },
  }
}
