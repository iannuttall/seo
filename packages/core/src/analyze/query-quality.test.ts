import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLowActionabilityQuery } from './query-quality.js'

test('isLowActionabilityQuery keeps normal SEO queries', () => {
  assert.equal(isLowActionabilityQuery('x search'), false)
  assert.equal(isLowActionabilityQuery('origin of the last name laroya'), false)
  assert.equal(isLowActionabilityQuery('high tide today cebu'), false)
})

test('isLowActionabilityQuery drops currency and operator dumps', () => {
  assert.equal(isLowActionabilityQuery('7555bdt'), true)
  assert.equal(
    isLowActionabilityQuery(
      'kilo code x_keyword_search tool for advanced search with post content: keywords or exact phrase from: to: since: until: min_faves: filter:media example',
    ),
    true,
  )
})
