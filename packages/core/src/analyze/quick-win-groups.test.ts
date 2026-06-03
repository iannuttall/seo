import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupQuickWins } from './site-diagnostics/quick-win-groups.js'
import type { QuickWinItem } from './site-diagnostics/types.js'

function item(input: Partial<QuickWinItem> = {}): QuickWinItem {
  return {
    query: input.query ?? 'salary for plumber',
    url: input.url ?? 'https://example.com/a/',
    template: input.template ?? {
      id: 'city-salary',
      label: 'City salary page',
      confidence: 'high',
    },
    position: input.position ?? 7,
    impressions: input.impressions ?? 1000,
    ctr: input.ctr ?? 0,
    expectedCtrAt3: input.expectedCtrAt3 ?? 0.1,
    estimatedClickLift: input.estimatedClickLift ?? 100,
    recommendation: input.recommendation ?? {
      principle: 'C.3',
      evidenceRef: 'Evidence.',
      action: 'Test title wording.',
      effort: 'S',
      confidence: 'medium',
    },
  }
}

test('groupQuickWins groups repeated query/template wins', () => {
  const groups = groupQuickWins([
    item({ url: 'https://example.com/a/', estimatedClickLift: 100 }),
    item({ url: 'https://example.com/b/', estimatedClickLift: 80 }),
    item({
      query: 'salary for dentist',
      url: 'https://example.com/c/',
      estimatedClickLift: 70,
    }),
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.count, 2)
  assert.equal(groups[0]?.totalEstimatedClickLift, 180)
  assert.match(groups[0]?.recommendation ?? '', /salary pages/)
  assert.match(groups[0]?.recommendation ?? '', /title, H1, meta/)
})
