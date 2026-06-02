import type { GscRow } from '../../../types.js'
import type { TestMetrics } from '../types.js'

export function pct(after: number, before: number): number | null {
  if (before === 0) return after === 0 ? 0 : null
  return Number((((after - before) / before) * 100).toFixed(2))
}

export function fixed(value: number, digits = 3): number {
  return Number(value.toFixed(digits))
}

export function summarizeRows(rows: GscRow[]): TestMetrics {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const ctr = impressions > 0 ? clicks / impressions : 0
  const position =
    impressions > 0
      ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
        impressions
      : 0

  return {
    clicks: fixed(clicks),
    impressions: fixed(impressions),
    ctr: fixed(ctr, 4),
    position: fixed(position),
  }
}
