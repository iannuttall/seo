import { SeoError } from '../errors.js'
import type { SegmentRange } from './segment-impact-types.js'
import {
  defaultDateRange,
  explicitDateRange,
  integerOption,
} from './site-diagnostics/quick-wins-report-input.js'

const DAY_MS = 86_400_000
const MAX_WINDOW_DAYS = 240

function subtractDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export function segmentRangeDays(range: SegmentRange): number {
  return (
    Math.floor(
      (Date.parse(`${range.endDate}T00:00:00.000Z`) -
        Date.parse(`${range.startDate}T00:00:00.000Z`)) /
        DAY_MS,
    ) + 1
  )
}

export function segmentComparisonRange(
  after: SegmentRange,
  compareDays: number,
): SegmentRange {
  const endDate = subtractDays(after.startDate, 1)
  return {
    startDate: subtractDays(endDate, compareDays - 1),
    endDate,
  }
}

export function validateSegmentRanges(input: {
  before: SegmentRange
  after: SegmentRange
}): { beforeDays: number; afterDays: number } {
  const before = explicitDateRange(input.before, MAX_WINDOW_DAYS)
  const after = explicitDateRange(input.after, MAX_WINDOW_DAYS)
  if (!before || !after) {
    throw new SeoError('INVALID_INPUT', 'Both segment ranges are required.')
  }
  if (subtractDays(input.after.startDate, 1) !== input.before.endDate) {
    throw new SeoError(
      'INVALID_INPUT',
      'Segment comparison windows must be adjacent.',
    )
  }
  if (before.days !== after.days) {
    throw new SeoError(
      'INVALID_INPUT',
      'Segment comparison windows must have equal lengths.',
    )
  }
  return { beforeDays: before.days, afterDays: after.days }
}

export function resolveSegmentRanges(input: {
  days?: number
  compareDays?: number
  startDate?: string
  endDate?: string
  now: Date
}): { before: SegmentRange; after: SegmentRange } {
  const days = integerOption({
    value: input.days,
    fallback: 28,
    minimum: 1,
    maximum: MAX_WINDOW_DAYS,
    label: 'days',
  })
  const explicit = explicitDateRange(input, MAX_WINDOW_DAYS)
  const after = explicit?.range ?? defaultDateRange(days, input.now)
  const compareDays = integerOption({
    value: input.compareDays,
    fallback: segmentRangeDays(after),
    minimum: 1,
    maximum: MAX_WINDOW_DAYS,
    label: 'compareDays',
  })
  const afterDays = segmentRangeDays(after)
  if (compareDays !== afterDays) {
    throw new SeoError(
      'INVALID_INPUT',
      `compareDays must equal the ${afterDays}-day current window. Segment impact requires adjacent equal-length periods.`,
    )
  }
  return { before: segmentComparisonRange(after, compareDays), after }
}

export function validateSegmentSite(site: string): void {
  if (!site.trim()) {
    throw new SeoError('INVALID_INPUT', 'site must not be empty.')
  }
}
