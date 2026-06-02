import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkRecoverRecommendation } from './monitoring/link-recover.js'

test('linkRecoverRecommendation prioritizes broken search-value URLs', () => {
  const recommendation = linkRecoverRecommendation({
    issue: 'final-4xx',
    url: 'https://example.com/old-page/',
    finalUrl: 'https://example.com/old-page/',
    clicks: 42,
    impressions: 1200,
  })

  assert.equal(
    recommendation.principle,
    'Search-value URLs should not resolve to dead pages.',
  )
  assert.match(recommendation.action, /301 redirect/)
  assert.equal(recommendation.confidence, 'high')
})

test('linkRecoverRecommendation handles non-indexable final targets', () => {
  const recommendation = linkRecoverRecommendation({
    issue: 'non-indexable-final',
    url: 'https://example.com/old-page/',
    finalUrl: 'https://example.com/new-page/',
    clicks: 8,
    impressions: 400,
  })

  assert.equal(
    recommendation.principle,
    'Recovered search-value URLs need an indexable final target.',
  )
  assert.match(recommendation.action, /noindex|robots/)
})
