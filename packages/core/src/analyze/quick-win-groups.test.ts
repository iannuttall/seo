import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupQuickWins } from './site-diagnostics/quick-win-groups.js'
import type { QuickWinItem } from './site-diagnostics/types.js'

function item(input: Partial<QuickWinItem> = {}): QuickWinItem {
  const estimatedCtrClickShortfall = input.estimatedCtrClickShortfall ?? 100
  return {
    query: input.query ?? 'salary for plumber',
    url: input.url ?? 'https://example.com/a/',
    template: input.template ?? {
      id: 'city-salary',
      label: 'City salary page',
      confidence: 'high',
    },
    position: input.position ?? 7,
    clicks: input.clicks ?? 0,
    impressions: input.impressions ?? 1000,
    ctr: input.ctr ?? 0,
    targetCtr: input.targetCtr ?? 0.025,
    benchmark: input.benchmark ?? {
      targetCtr: 0.025,
      source: 'builtin_position_ctr_curve_v1',
      samplePopulation: 'all_qualified_url_samples',
      peerRows: 0,
      peerImpressions: 0,
      qualifiedPeerImpressions: 0,
      urlSamples: 0,
      positiveUrlSamples: 0,
      excludedTargetRows: 1,
      leaveOut: 'target_url',
      confidence: 'fallback',
      heuristic: true,
    },
    estimatedCtrClickShortfall,
    priority: input.priority ?? {
      method: 'impressions_x_target_ctr_shortfall',
      score: estimatedCtrClickShortfall,
      heuristic: true,
      estimatedClickLift: false,
    },
    finding: input.finding ?? 'ctr-target-shortfall',
    recommendation: input.recommendation ?? {
      principle: 'C.3',
      evidenceRef: 'Evidence.',
      action: 'Inspect the live result.',
      effort: 'S',
      confidence: 'low',
    },
  }
}

test('groups only recognised templates across distinct URLs', () => {
  const groups = groupQuickWins([
    item({
      url: 'https://example.com/a/',
      estimatedCtrClickShortfall: 100,
    }),
    item({
      url: 'https://example.com/b/',
      estimatedCtrClickShortfall: 80,
    }),
    item({
      query: 'salary for dentist',
      url: 'https://example.com/c/',
      estimatedCtrClickShortfall: 70,
    }),
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.rowCount, 2)
  assert.equal(groups[0]?.urlCount, 2)
  assert.equal(groups[0]?.totalEstimatedCtrClickShortfall, 180)
  assert.match(groups[0]?.recommendation ?? '', /2 distinct/)
  assert.doesNotMatch(groups[0]?.recommendation ?? '', /currency|hourly/)
})

test('does not invent a shared template from repeated rows on one URL', () => {
  assert.deepEqual(
    groupQuickWins([
      item({ query: 'résumé examples' }),
      item({ query: 'résumé examples' }),
    ]),
    [],
  )
})

test('preserves meaningful diacritics in group keys', () => {
  const groups = groupQuickWins([
    item({ query: 'resume examples', url: 'https://example.com/a/' }),
    item({ query: 'résumé examples', url: 'https://example.com/b/' }),
  ])

  assert.deepEqual(groups, [])
})
