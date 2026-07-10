import assert from 'node:assert/strict'
import test from 'node:test'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { geoGaps } from './geo-gaps.js'
import { createCrawlReport } from './report.js'

test('geoGaps returns evidence-backed AI Search eligibility blockers', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      page('https://example.com/a', false),
      page('https://example.com/b', true),
    ],
    issues: [
      {
        ruleId: 'noindex',
        title: 'Noindex found',
        category: 'indexability',
        severity: 'medium',
        url: 'https://example.com/a',
      },
    ],
  })

  const gaps = geoGaps(report)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0]?.url, 'https://example.com/a')
  assert.equal(gaps[0]?.observations.structuredData, false)
  assert.equal(
    gaps[0]?.searchEligibility.snippetEligibility.status,
    'not-restricted',
  )
  assert.equal(gaps[0]?.issues[0]?.ruleId, 'noindex')
})

test('geoGaps returns blocked and limited snippet controls with evidence', () => {
  const blocked = page('https://example.com/blocked-snippet', false)
  blocked.metaRobots = 'nosnippet'
  const limited = page('https://example.com/limited-snippet', false)
  limited.xRobotsTag =
    'otherbot: nosnippet, googlebot: max-snippet:40, max-image-preview:large'
  const unrestricted = page('https://example.com/unrestricted', false)
  unrestricted.metaRobots = 'max-snippet:-1'
  const gaps = geoGaps(
    createCrawlReport({
      config: { url: 'https://example.com/' },
      pages: [blocked, limited, unrestricted],
    }),
  )

  assert.deepEqual(
    gaps.map((gap) => [
      gap.url,
      gap.searchEligibility.snippetEligibility.status,
      gap.searchEligibility.snippetEligibility.maxCharacters,
    ]),
    [
      ['https://example.com/blocked-snippet', 'blocked', 0],
      ['https://example.com/limited-snippet', 'limited', 40],
    ],
  )
  assert.deepEqual(gaps[1]?.searchEligibility.snippetEligibility.evidence, [
    {
      source: 'x-robots-tag',
      directive: 'max-snippet',
      raw: 'max-snippet:40',
      value: 40,
    },
  ])
})

function page(url: string, structuredData: boolean): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
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
