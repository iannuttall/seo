import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../types.js'
import {
  CTR_MIN_IMPRESSIONS_SCALE,
  minImpressionsCaveat,
  POSITION_MIN_IMPRESSIONS_SCALE,
  resolveMinImpressionsPolicy,
  retainedImpressions,
  scaledMinImpressions,
} from './min-impressions-policy.js'

function rowWith(impressions: number): GscRow {
  return {
    keys: ['query', 'https://example.com/'],
    clicks: 0,
    impressions,
    ctr: 0,
    position: 5,
  }
}

test('scales one in 5,000 retained impressions between floor and ceiling', () => {
  const position = POSITION_MIN_IMPRESSIONS_SCALE
  const ctr = CTR_MIN_IMPRESSIONS_SCALE
  assert.equal(scaledMinImpressions(0, position), 10)
  assert.equal(scaledMinImpressions(150_000, position), 30)
  assert.equal(scaledMinImpressions(150_001, position), 31)
  assert.equal(scaledMinImpressions(500_000, position), 100)
  assert.equal(scaledMinImpressions(5_000_000, position), 100)
  assert.equal(scaledMinImpressions(0, ctr), 30)
  assert.equal(scaledMinImpressions(150_000, ctr), 30)
  assert.equal(scaledMinImpressions(400_000, ctr), 80)
  assert.equal(scaledMinImpressions(1_000_000, ctr), 200)
  assert.equal(scaledMinImpressions(9_000_000, ctr), 200)
})

test('counts only finite positive impressions in the basis', () => {
  assert.equal(
    retainedImpressions([
      rowWith(100),
      rowWith(Number.NaN),
      rowWith(-5),
      rowWith(Number.POSITIVE_INFINITY),
      rowWith(0.5),
    ]),
    100.5,
  )
})

test('an explicit minimum wins and is bounded by the report', () => {
  const rows = [rowWith(1_000_000)]
  const explicit = resolveMinImpressionsPolicy({
    explicit: 7.9,
    rows,
    scale: CTR_MIN_IMPRESSIONS_SCALE,
    minimum: 1,
    maximum: 1_000,
  })
  assert.deepEqual(explicit, {
    effective: 7,
    source: 'explicit',
    basisImpressions: 1_000_000,
    scale: CTR_MIN_IMPRESSIONS_SCALE,
  })
  assert.equal(
    resolveMinImpressionsPolicy({
      explicit: -3,
      rows,
      scale: CTR_MIN_IMPRESSIONS_SCALE,
      minimum: 1,
      maximum: 1_000,
    }).effective,
    1,
  )
  const fallback = resolveMinImpressionsPolicy({
    explicit: Number.NaN,
    rows,
    scale: CTR_MIN_IMPRESSIONS_SCALE,
    minimum: 1,
    maximum: 1_000,
  })
  assert.equal(fallback.source, 'scaled-default')
  assert.equal(fallback.effective, 200)
})

test('describes the policy in one caveat line', () => {
  const scaled = resolveMinImpressionsPolicy({
    explicit: undefined,
    rows: [rowWith(150_000)],
    scale: CTR_MIN_IMPRESSIONS_SCALE,
    minimum: 1,
    maximum: 1_000,
  })
  assert.equal(
    minImpressionsCaveat({ policy: scaled, belowMinimumRows: 1 }),
    'Minimum impressions per query/page row: 30, scaled from 150000 retained impressions (1 in 5,000, between 30 and 200); 1 row was below it. This scaling is a heuristic.',
  )
  const explicit = resolveMinImpressionsPolicy({
    explicit: 50,
    rows: [],
    scale: CTR_MIN_IMPRESSIONS_SCALE,
    minimum: 1,
    maximum: 1_000,
  })
  assert.equal(
    minImpressionsCaveat({ policy: explicit, belowMinimumRows: 2 }),
    'Minimum impressions per query/page row: 50 (requested); 2 rows were below it.',
  )
})
