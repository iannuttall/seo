import { SeoError } from '../../../errors.js'
import { defaultDateRange } from '../../site-diagnostics/quick-wins-report-input.js'
import { dateShift } from './dates.js'

const DAY_MS = 86_400_000

function exactDate(value: string, label: string): string {
  const pattern = /^\d{4}-\d{2}-\d{2}$/
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (
    !pattern.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be a valid YYYY-MM-DD date.`,
    )
  }
  return value
}

function boundedDays(
  value: number | undefined,
  fallback: number,
  label: string,
) {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 548) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be a whole number between 1 and 548.`,
    )
  }
  return resolved
}

function calendarDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime()
  return Math.floor((end - start) / DAY_MS) + 1
}

function subtractCalendarMonths(value: string, months: number): string {
  const source = new Date(`${value}T00:00:00.000Z`)
  const first = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() - months, 1),
  )
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate()
  first.setUTCDate(Math.min(source.getUTCDate(), lastDay))
  return first.toISOString().slice(0, 10)
}

export type MeasurementWindowPlan = {
  before: { startDate: string; endDate: string }
  after: { startDate: string; endDate: string }
  requestedDays: number
  effectiveDays: number
  afterWindowTruncated: boolean
  availableDateWindow: {
    earliestDate: string
    latestFinalDate: string
  }
}

export function measurementWindow(input: {
  changedAt: string
  beforeDays?: number
  afterDays?: number
  now: Date
}): MeasurementWindowPlan {
  const changedAt = exactDate(input.changedAt, 'changedAt')
  const beforeDays = boundedDays(input.beforeDays, 28, 'beforeDays')
  const afterDays = boundedDays(input.afterDays, beforeDays, 'afterDays')
  if (beforeDays !== afterDays) {
    throw new SeoError(
      'INVALID_INPUT',
      'beforeDays and afterDays must match so raw totals use equal calendar windows.',
    )
  }

  const latestFinalDate = defaultDateRange(1, input.now).endDate
  const pacificToday = dateShift(latestFinalDate, 4)
  const earliestDate = subtractCalendarMonths(pacificToday, 16)
  if (changedAt > latestFinalDate) {
    throw new SeoError(
      'INSUFFICIENT_DATA',
      `changedAt must be on or before the latest finalized GSC date, ${latestFinalDate}.`,
    )
  }

  const desiredAfterEnd = dateShift(changedAt, afterDays - 1)
  const afterEnd =
    desiredAfterEnd > latestFinalDate ? latestFinalDate : desiredAfterEnd
  const effectiveDays = calendarDays(changedAt, afterEnd)
  const beforeEnd = dateShift(changedAt, -1)
  const beforeStart = dateShift(beforeEnd, -(effectiveDays - 1))
  if (beforeStart < earliestDate) {
    throw new SeoError(
      'INVALID_INPUT',
      `The equal before window starts before ${earliestDate}, the current 16-month GSC retention boundary.`,
    )
  }

  return {
    before: { startDate: beforeStart, endDate: beforeEnd },
    after: { startDate: changedAt, endDate: afterEnd },
    requestedDays: beforeDays,
    effectiveDays,
    afterWindowTruncated: effectiveDays < afterDays,
    availableDateWindow: { earliestDate, latestFinalDate },
  }
}
