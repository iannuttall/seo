import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCrawlSkipReasonCounts } from './crawl-skip-reasons.js'

test('normalizes duplicate skip reasons with canonical impact and order', () => {
  const normalized = normalizeCrawlSkipReasonCounts({
    skippedUrls: 4,
    skipReasons: [
      { reason: 'off-origin', impact: 'coverage-affecting', count: 1 },
      { reason: 'asset-url', impact: 'coverage-affecting', count: 1 },
      { reason: 'off-origin', impact: 'non-impacting', count: 2 },
      { reason: 'made-up', impact: 'non-impacting', count: 10 },
    ],
  })

  assert.deepEqual(normalized, {
    skippedUrls: 4,
    skipReasons: [
      { reason: 'asset-url', impact: 'non-impacting', count: 1 },
      { reason: 'off-origin', impact: 'non-impacting', count: 3 },
    ],
    skippedUrlsByImpact: {
      coverageAffecting: 0,
      nonImpacting: 4,
    },
  })
})

test('keeps unclassified legacy skips coverage-affecting', () => {
  const normalized = normalizeCrawlSkipReasonCounts({
    skippedUrls: 3,
    skipReasons: [
      { reason: 'configured-exclusion', count: 1 },
      { reason: 'asset-url', count: -1 },
    ],
  })

  assert.deepEqual(normalized, {
    skippedUrls: 3,
    skipReasons: [
      {
        reason: 'configured-exclusion',
        impact: 'non-impacting',
        count: 1,
      },
      {
        reason: 'legacy-unclassified',
        impact: 'coverage-affecting',
        count: 2,
      },
    ],
    skippedUrlsByImpact: {
      coverageAffecting: 2,
      nonImpacting: 1,
    },
  })
})
