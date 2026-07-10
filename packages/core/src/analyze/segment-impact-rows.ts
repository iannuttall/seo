import type { GscRow } from '../types.js'
import type {
  SegmentImpactItem,
  UnmatchedSegment,
} from './segment-impact-types.js'

type RetainedRow = {
  key: string
  clicks: number
  impressions: number
  position: number | null
}

export type RetainedSegmentRows = {
  rows: Map<string, RetainedRow>
  invalidRows: number
  duplicateRows: number
  conflictingRows: number
}

function fixed(value: number): number {
  return Number(value.toFixed(3))
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validMetric(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function retainedRows(rows: GscRow[]): RetainedSegmentRows {
  const retained = new Map<string, RetainedRow>()
  const conflicted = new Set<string>()
  let invalidRows = 0
  let duplicateRows = 0
  let conflictingRows = 0
  for (const row of rows) {
    const key = row.keys[0]
    if (
      row.keys.length !== 1 ||
      !key?.trim() ||
      !validCount(row.clicks) ||
      !validCount(row.impressions) ||
      !validMetric(row.position) ||
      (row.impressions > 0 && row.position <= 0)
    ) {
      invalidRows += 1
      continue
    }
    const value = {
      key,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.impressions > 0 ? fixed(row.position) : null,
    }
    const existing = retained.get(key)
    if (existing) {
      if (
        existing.clicks === value.clicks &&
        existing.impressions === value.impressions &&
        existing.position === value.position
      ) {
        duplicateRows += 1
      } else {
        conflictingRows += 1
        retained.delete(key)
        conflicted.add(key)
      }
      continue
    }
    if (!conflicted.has(key)) retained.set(key, value)
  }
  return { rows: retained, invalidRows, duplicateRows, conflictingRows }
}

function impactItem(
  before: RetainedRow,
  after: RetainedRow,
): SegmentImpactItem {
  const positionDelta =
    before.position === null || after.position === null
      ? null
      : fixed(after.position - before.position)
  return {
    key: before.key,
    evidenceScope: 'matched-retained-segment',
    beforeClicks: before.clicks,
    afterClicks: after.clicks,
    clickDelta: fixed(after.clicks - before.clicks),
    beforeImpressions: before.impressions,
    afterImpressions: after.impressions,
    impressionDelta: fixed(after.impressions - before.impressions),
    beforePosition: before.position,
    afterPosition: after.position,
    positionDelta,
  }
}

function unmatchedRow(
  row: RetainedRow,
  retainedIn: UnmatchedSegment['retainedIn'],
): UnmatchedSegment {
  return {
    ...row,
    retainedIn,
    reason: 'not-retained-in-other-window',
  }
}

export function compareRetainedSegmentRows(input: {
  beforeRows: GscRow[]
  afterRows: GscRow[]
}): {
  before: RetainedSegmentRows
  after: RetainedSegmentRows
  matched: SegmentImpactItem[]
  unmatched: UnmatchedSegment[]
} {
  const before = retainedRows(input.beforeRows)
  const after = retainedRows(input.afterRows)
  const matched: SegmentImpactItem[] = []
  const unmatched: UnmatchedSegment[] = []
  for (const [key, row] of before.rows) {
    const afterRow = after.rows.get(key)
    if (afterRow) matched.push(impactItem(row, afterRow))
    else unmatched.push(unmatchedRow(row, 'before'))
  }
  for (const [key, row] of after.rows) {
    if (!before.rows.has(key)) unmatched.push(unmatchedRow(row, 'after'))
  }
  matched.sort(
    (left, right) =>
      Math.abs(right.clickDelta) - Math.abs(left.clickDelta) ||
      compareText(left.key, right.key),
  )
  unmatched.sort(
    (left, right) =>
      right.clicks - left.clicks ||
      compareText(left.retainedIn, right.retainedIn) ||
      compareText(left.key, right.key),
  )
  return { before, after, matched, unmatched }
}
