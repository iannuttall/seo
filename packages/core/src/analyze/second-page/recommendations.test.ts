import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SecondPageItem } from '../../types.js'
import { buildSecondPageRecommendations } from './recommendations.js'

const item: SecondPageItem = {
  url: 'https://example.com/page/',
  primaryQuery: 'doblado meaning',
  template: { id: 'example', label: 'Example template', confidence: 'high' },
  position: 11.4,
  impressions: 100,
  ctr: 0.01,
  coverage: {
    inTitleExact: false,
    inMeta: false,
    inH1: false,
    inFirst100Words: false,
    inSlug: false,
    bodyCount: 0,
  },
  recommendations: [],
}

test('second-page recommendation distinguishes exact phrase from term coverage', () => {
  const recommendations = buildSecondPageRecommendations(
    'doblado meaning',
    item,
    { wordCount: 1200 } as Parameters<typeof buildSecondPageRecommendations>[2],
    [],
  )

  assert.equal(recommendations[0]?.principle, 'C.2')
  assert.match(recommendations[0]?.evidenceRef ?? '', /Exact query phrase/)
  assert.doesNotMatch(recommendations[0]?.evidenceRef ?? '', /^Query /)
})
