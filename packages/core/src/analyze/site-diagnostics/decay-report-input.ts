import { SeoError } from '../../errors.js'
import type { DecayComparison } from './decay-types.js'
import { defaultDateRange } from './quick-wins-report-input.js'

export function decayNumberOption(input: {
  value: number | undefined
  fallback: number
  minimum: number
  maximum: number
  label: string
}): number {
  const value = input.value ?? input.fallback
  if (
    !Number.isFinite(value) ||
    value < input.minimum ||
    value > input.maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be between ${input.minimum} and ${input.maximum}.`,
    )
  }
  return value
}

function rangeDays(range: { startDate: string; endDate: string }): number {
  return (
    Math.floor(
      (new Date(`${range.endDate}T00:00:00.000Z`).getTime() -
        new Date(`${range.startDate}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1
  )
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function subtractDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return dateString(date)
}

function priorYearDate(value: string): string {
  const source = new Date(`${value}T00:00:00.000Z`)
  const year = source.getUTCFullYear() - 1
  const month = source.getUTCMonth()
  const day = source.getUTCDate()
  const candidate = new Date(Date.UTC(year, month, day))
  if (candidate.getUTCMonth() !== month) {
    return dateString(new Date(Date.UTC(year, month + 1, 0)))
  }
  return dateString(candidate)
}

function subtractCalendarMonths(date: Date, months: number): string {
  const day = date.getUTCDate()
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1),
  )
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return dateString(target)
}

export function validateDecayRanges(input: {
  current: { startDate: string; endDate: string }
  previous: { startDate: string; endDate: string }
  now: Date
}): void {
  const latestFinalDate = defaultDateRange(1, input.now).endDate
  if (input.current.endDate > latestFinalDate) {
    throw new SeoError(
      'INVALID_INPUT',
      `Decay end date must be ${latestFinalDate} or earlier so both GSC windows use final data.`,
    )
  }
  const pacificToday = new Date(`${latestFinalDate}T00:00:00.000Z`)
  pacificToday.setUTCDate(pacificToday.getUTCDate() + 4)
  const retentionStart = subtractCalendarMonths(pacificToday, 16)
  if (input.previous.startDate < retentionStart) {
    throw new SeoError(
      'INVALID_INPUT',
      `Comparison range starts before Search Console's rolling 16-month API history (${retentionStart}). Choose a shorter range or use previously stored data.`,
    )
  }
}

export function decayComparisonRange(
  current: { startDate: string; endDate: string },
  comparison: DecayComparison = 'previous-period',
): { startDate: string; endDate: string } {
  const days = rangeDays(current)
  if (comparison === 'year-over-year') {
    const endDate = priorYearDate(current.endDate)
    return { startDate: subtractDays(endDate, days - 1), endDate }
  }
  const endDate = subtractDays(current.startDate, 1)
  return { startDate: subtractDays(endDate, days - 1), endDate }
}
