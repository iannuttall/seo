import type { ChangeMeasurement, TestMetrics } from '../types.js'

export function classify(input: {
  before: TestMetrics
  after: TestMetrics
  clickPct: number | null
  clickDelta: number
  positionDelta: number
}): Pick<ChangeMeasurement, 'verdict' | 'confidence' | 'note'> {
  const totalImpressions = input.before.impressions + input.after.impressions
  if (totalImpressions < 100) {
    return {
      verdict: 'not-enough-data',
      confidence: 'low',
      note: 'The comparison windows have fewer than 100 impressions total.',
    }
  }

  const betterPosition = input.positionDelta < -0.5
  const worsePosition = input.positionDelta > 0.5
  if (
    input.clickPct === null &&
    input.before.clicks === 0 &&
    input.after.clicks > 0 &&
    input.after.ctr > input.before.ctr
  ) {
    return {
      verdict: 'positive',
      confidence: 'low',
      note: 'Clicks and CTR increased from a zero-click baseline. Treat the direction as early evidence because percentage growth is undefined.',
    }
  }

  const pctValue = input.clickPct ?? 0
  const positive = input.clickDelta > 0 && (pctValue >= 10 || betterPosition)
  const negative = input.clickDelta < 0 && (pctValue <= -10 || worsePosition)

  const confidence =
    Math.abs(input.clickDelta) >= 50 && Math.abs(pctValue) >= 30
      ? 'high'
      : Math.abs(input.clickDelta) >= 10 && Math.abs(pctValue) >= 10
        ? 'medium'
        : 'low'

  if (positive) {
    return {
      verdict: 'positive',
      confidence,
      note: 'Clicks improved after the change. Confirm with segment breakdown before rolling out widely.',
    }
  }
  if (negative) {
    return {
      verdict: 'negative',
      confidence,
      note: 'Clicks declined after the change. Check query mix, ranking movement, and indexability before reverting.',
    }
  }
  if (betterPosition || worsePosition) {
    return {
      verdict: 'mixed',
      confidence,
      note: 'Ranking movement and click movement disagree. Inspect SERP layout, CTR, and query demand.',
    }
  }
  return {
    verdict: 'flat',
    confidence,
    note: 'No material movement detected in this window.',
  }
}
