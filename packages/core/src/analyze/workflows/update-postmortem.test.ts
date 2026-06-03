import assert from 'node:assert/strict'
import test from 'node:test'
import type { SegmentImpactItem } from '../segment-impact.js'
import { inferTemplateMovement } from './update-postmortem.js'

test('inferTemplateMovement surfaces repeated winning URL patterns', () => {
  const movement = inferTemplateMovement({
    winners: [
      page('https://example.com/cities/london/', 120),
      page('https://example.com/cities/paris/', 90),
      page('https://example.com/cities/rome/', 80),
      page('https://example.com/cities/madrid/', 70),
      page('https://example.com/blog/product-launch/', 10),
      page('https://example.com/docs/getting-started/', 5),
    ],
    losers: [],
  })

  assert.equal(movement.length, 1)
  assert.equal(movement[0]?.signature, '/cities/:value')
  assert.equal(movement[0]?.direction, 'winner')
  assert.equal(movement[0]?.urlCount, 4)
  assert.match(movement[0]?.summary ?? '', /gained 360 clicks/)
})

test('inferTemplateMovement stays quiet for sparse one-off pages', () => {
  const movement = inferTemplateMovement({
    winners: [
      page('https://example.com/pricing/', 120),
      page('https://example.com/about/', 80),
      page('https://example.com/blog/founder-note/', 60),
    ],
    losers: [page('https://example.com/docs/install/', -40)],
  })

  assert.deepEqual(movement, [])
})

test('inferTemplateMovement explains broad slug patterns with common terms', () => {
  const movement = inferTemplateMovement({
    winners: [],
    losers: [
      page('https://example.com/average-teacher-salary-in-france/', -100),
      page('https://example.com/average-nurse-salary-in-germany/', -90),
      page('https://example.com/average-engineer-salary-in-italy/', -80),
      page('https://example.com/average-dentist-salary-in-spain/', -70),
      page('https://example.com/contact/', -5),
      page('https://example.com/privacy/', -5),
    ],
  })

  assert.equal(movement.length, 1)
  assert.equal(movement[0]?.signature, '/:slug')
  assert.equal(movement[0]?.direction, 'loser')
  assert.ok(movement[0]?.commonTerms.includes('average'))
  assert.ok(movement[0]?.commonTerms.includes('salary'))
  assert.match(movement[0]?.summary ?? '', /Common URL terms/)
})

function page(url: string, clickDelta: number): SegmentImpactItem {
  return {
    key: url,
    beforeClicks: clickDelta < 0 ? Math.abs(clickDelta) : 0,
    afterClicks: clickDelta > 0 ? clickDelta : 0,
    clickDelta,
    beforeImpressions: clickDelta < 0 ? Math.abs(clickDelta) * 10 : 0,
    afterImpressions: clickDelta > 0 ? clickDelta * 10 : 0,
    impressionDelta: clickDelta * 10,
    beforePosition: 5,
    afterPosition: 5,
    positionDelta: 0,
  }
}
