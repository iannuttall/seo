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
  assert.equal(isLowActionabilityQuery('7555bdt.com'), true)
  assert.equal(isLowActionabilityQuery('site:playbooks.com'), true)
  assert.equal(
    isLowActionabilityQuery('best rss reader -site:reddit.com'),
    true,
  )
  assert.equal(isLowActionabilityQuery('intitle:feedly alternative'), true)
  assert.equal(
    isLowActionabilityQuery(
      'kilo code x_keyword_search tool for advanced search with post content: keywords or exact phrase from: to: since: until: min_faves: filter:media example',
    ),
    true,
  )
  assert.equal(
    isLowActionabilityQuery(
      'cost comparison between free and premium versions of flipboard for desktop users -filetype:txt -filetype:pdf -filetype:epub -site:youtube.com -site:reddit.com -site:amazon.com',
    ),
    true,
  )
})

test('isLowActionabilityQuery drops leaked ranking snippets', () => {
  assert.equal(isLowActionabilityQuery('"ranking/303" "moved up" "$"'), true)
})
