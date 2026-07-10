import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  estimateSerpTitleWidth,
  SERP_TITLE_REFERENCE_WIDTH_PX,
} from './title-width.js'

test('title width uses glyph measurements instead of character count', () => {
  const wide = estimateSerpTitleWidth('WWWWWWWWWW')
  const narrow = estimateSerpTitleWidth('iiiiiiiiii')

  assert.equal(wide.graphemeCount, narrow.graphemeCount)
  assert.ok(wide.estimatedPixels > narrow.estimatedPixels * 4)
  assert.equal(wide.confidence, 'high')
})

test('title width handles Latin marks, kerning, CJK, and emoji deterministically', () => {
  assert.equal(
    estimateSerpTitleWidth('café').estimatedPixels,
    estimateSerpTitleWidth('cafe').estimatedPixels,
  )
  assert.ok(
    estimateSerpTitleWidth('AV').estimatedPixels <
      estimateSerpTitleWidth('A V').estimatedPixels,
  )
  assert.deepEqual(estimateSerpTitleWidth('検索🙂'), {
    estimatedPixels: 63,
    referencePixels: SERP_TITLE_REFERENCE_WIDTH_PX,
    status: 'within-reference',
    confidence: 'medium',
    profile: {
      id: 'arial-20-v1',
      fontFamily: 'Arial',
      fontSizePixels: 20,
      fontWeight: 400,
    },
    graphemeCount: 3,
    fallbackGraphemes: [],
  })
  assert.deepEqual(
    estimateSerpTitleWidth('検索🙂'),
    estimateSerpTitleWidth('検索🙂'),
  )
})

test('title width counts complex emoji by grapheme instead of UTF-16 units', () => {
  for (const emoji of ['😀', '👩🏿‍👩🏿‍👧🏿‍👧🏿', '🇬🇧', '1️⃣']) {
    const estimate = estimateSerpTitleWidth(emoji)
    assert.equal(estimate.graphemeCount, 1)
    assert.equal(estimate.estimatedPixels, 23)
    assert.equal(estimate.confidence, 'medium')
  }
})

test('title width covers printable ASCII and common result punctuation', () => {
  const printableAscii = Array.from({ length: 95 }, (_, index) =>
    String.fromCodePoint(index + 32),
  ).join('')
  const estimate = estimateSerpTitleWidth(`${printableAscii} “title”\u2014…`)

  assert.equal(estimate.confidence, 'high')
  assert.deepEqual(estimate.fallbackGraphemes, [])
})

test('title width discloses unsupported-script fallbacks', () => {
  const estimate = estimateSerpTitleWidth('مرحبا')

  assert.equal(estimate.confidence, 'low')
  assert.ok(estimate.fallbackGraphemes.length > 0)
})
