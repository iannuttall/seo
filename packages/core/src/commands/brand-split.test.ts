import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SearchAnalyticsRequest } from '../gsc/client/types.js'
import {
  brandSplit,
  brandSplitLines,
  notBrand,
  safeNames,
} from './brand-split.js'

const current = { startDate: '2026-10-01', endDate: '2026-10-28' }
const previous = { startDate: '2026-09-03', endDate: '2026-09-30' }

// A Search Console reader: Google's classification answers with the given
// rows, the brand-name regex cuts with fixed totals, and the site total.
function reader(classified: { keys: string[]; clicks: number }[]) {
  return async (_site: string, body: SearchAnalyticsRequest) => {
    const row = (clicks: number) => ({
      keys: [],
      clicks,
      impressions: clicks * 10,
      ctr: 0,
      position: 1,
    })
    if (body.dimensions?.[0] === 'brandedClassification') {
      const rows = classified.map((item) => ({
        ...row(item.clicks),
        keys: item.keys,
      }))
      return { rows, calls: 1, rowsFetched: rows.length }
    }
    const operator = body.dimensionFilterGroups?.[0]?.filters[0]?.operator
    const clicks =
      operator === 'includingRegex'
        ? 120
        : operator === 'excludingRegex'
          ? 780
          : 1000
    return { rows: [row(clicks)], calls: 1, rowsFetched: 1 }
  }
}

// Google gives a property it does not classify no rows. That must read as
// "not classified" and fall back to the saved brand names, never as zero
// brand searches.
test('an unclassified property falls back to brand names, not zero brand', async () => {
  const split = await brandSplit(
    reader([]),
    'sc-domain:example.com',
    current,
    previous,
    ['Example'],
  )
  assert.equal(split.google, 'not-classified')
  assert.equal(split.current.google, null)
  assert.deepEqual(notBrand(split)?.by, 'brand_names')
  assert.equal(notBrand(split)?.current.clicks, 780)
  const text = brandSplitLines(split).join('\n')
  assert.match(text, /not classified, not zero brand searches/)
  assert.doesNotMatch(text, /By Google’s brand classification: brand 0/)
})

test('a classified property uses Google and flags a large gap from the brand names', async () => {
  const split = await brandSplit(
    reader([
      { keys: ['BRANDED'], clicks: 300 },
      { keys: ['NON_BRANDED'], clicks: 700 },
    ]),
    'sc-domain:example.com',
    current,
    previous,
    ['Example'],
  )
  assert.equal(split.google, 'classified')
  const side = notBrand(split)
  assert.equal(side?.by, 'google')
  assert.equal(side?.current.clicks, 700)
  // 300 brand clicks by Google against 120 by the names.
  assert.equal(split.differ, true)
})

// Google counts the exact search "easy recipes" as brand but not "easy
// recipes for dinner". A saved name hides every search that contains it,
// so "easy recipes" is not safe to save, while "easyrecipes" is.
test('safeNames only offers names whose hidden clicks are mostly brand', () => {
  const branded = [
    { query: 'easy recipes', clicks: 40 },
    { query: 'easyrecipes', clicks: 12 },
    { query: 'easyrecipes login', clicks: 6 },
    { query: 'Easy-Recipes', clicks: 2 },
  ]
  const all = [
    ...branded,
    { query: 'easy recipes for dinner', clicks: 300 },
    { query: 'easyrecipes reviews', clicks: 1 },
  ]
  const result = safeNames(branded, all, ['easyrecipes.example'])
  // "easyrecipes login" is covered by "easyrecipes"; Easy-Recipes is safe but
  // too small to name.
  assert.deepEqual(result.safe, [{ name: 'easyrecipes', clicks: 12 }])
  assert.deepEqual(result.unsafe, ['easy recipes'])
  // Once saved, nothing safe is left to add.
  assert.deepEqual(safeNames(branded, all, ['easyrecipes']).safe, [])
})
