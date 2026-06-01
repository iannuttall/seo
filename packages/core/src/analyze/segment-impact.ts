import { querySearchAnalytics } from '../gsc/client.js'
import type { GscRow } from '../types.js'
import { defaultDateRange } from './shared.js'

export type SegmentDimension = 'page' | 'query' | 'country' | 'device'

export type SegmentImpactItem = {
  key: string
  beforeClicks: number
  afterClicks: number
  clickDelta: number
  beforeImpressions: number
  afterImpressions: number
  impressionDelta: number
  beforePosition: number
  afterPosition: number
  positionDelta: number
}

export type SegmentImpactReport = {
  site: string
  dimension: SegmentDimension
  before: { startDate: string; endDate: string }
  after: { startDate: string; endDate: string }
  generatedAt: string
  items: SegmentImpactItem[]
}

function weightedPosition(rows: GscRow[]): number {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  if (impressions <= 0) return 0
  return (
    rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
    impressions
  )
}

function groupRows(rows: GscRow[]): Map<string, GscRow[]> {
  const grouped = new Map<string, GscRow[]>()
  for (const row of rows) {
    const key = row.keys[0] ?? ''
    if (!key) continue
    const existing = grouped.get(key) ?? []
    existing.push(row)
    grouped.set(key, existing)
  }
  return grouped
}

function summarizeRows(rows: GscRow[]) {
  return {
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    position: weightedPosition(rows),
  }
}

function fixed(value: number): number {
  return Number(value.toFixed(3))
}

export function compareSegmentRows(input: {
  site: string
  dimension: SegmentDimension
  before: { startDate: string; endDate: string }
  after: { startDate: string; endDate: string }
  beforeRows: GscRow[]
  afterRows: GscRow[]
  limit?: number
}): SegmentImpactReport {
  const before = groupRows(input.beforeRows)
  const after = groupRows(input.afterRows)
  const keys = new Set([...before.keys(), ...after.keys()])

  const items = [...keys]
    .map((key) => {
      const beforeSummary = summarizeRows(before.get(key) ?? [])
      const afterSummary = summarizeRows(after.get(key) ?? [])
      return {
        key,
        beforeClicks: fixed(beforeSummary.clicks),
        afterClicks: fixed(afterSummary.clicks),
        clickDelta: fixed(afterSummary.clicks - beforeSummary.clicks),
        beforeImpressions: fixed(beforeSummary.impressions),
        afterImpressions: fixed(afterSummary.impressions),
        impressionDelta: fixed(
          afterSummary.impressions - beforeSummary.impressions,
        ),
        beforePosition: fixed(beforeSummary.position),
        afterPosition: fixed(afterSummary.position),
        positionDelta: fixed(afterSummary.position - beforeSummary.position),
      }
    })
    .sort((a, b) => Math.abs(b.clickDelta) - Math.abs(a.clickDelta))
    .slice(0, input.limit ?? 25)

  return {
    site: input.site,
    dimension: input.dimension,
    before: input.before,
    after: input.after,
    generatedAt: new Date().toISOString(),
    items,
  }
}

export async function segmentImpact(input: {
  site: string
  dimension?: SegmentDimension
  days?: number
  compareDays?: number
  limit?: number
  refresh?: boolean
}): Promise<SegmentImpactReport> {
  const days = input.days ?? 28
  const compareDays = input.compareDays ?? days
  const after = defaultDateRange(days)
  const beforeEnd = new Date(`${after.startDate}T00:00:00Z`)
  beforeEnd.setUTCDate(beforeEnd.getUTCDate() - 1)
  const beforeStart = new Date(beforeEnd)
  beforeStart.setUTCDate(beforeStart.getUTCDate() - (compareDays - 1))
  const before = {
    startDate: beforeStart.toISOString().slice(0, 10),
    endDate: beforeEnd.toISOString().slice(0, 10),
  }
  const dimension = input.dimension ?? 'page'

  const [beforeResult, afterResult] = await Promise.all([
    querySearchAnalytics(
      input.site,
      { ...before, dimensions: [dimension], type: 'web', dataState: 'final' },
      { refresh: input.refresh },
    ),
    querySearchAnalytics(
      input.site,
      { ...after, dimensions: [dimension], type: 'web', dataState: 'final' },
      { refresh: input.refresh },
    ),
  ])

  return compareSegmentRows({
    site: input.site,
    dimension,
    before,
    after,
    beforeRows: beforeResult.rows,
    afterRows: afterResult.rows,
    limit: input.limit,
  })
}
