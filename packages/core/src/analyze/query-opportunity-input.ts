import { SeoError } from '../errors.js'
import type {
  QueryOpportunityInput,
  ResolvedQueryOpportunityInput,
} from './query-opportunity-types.js'
import {
  defaultDateRange,
  explicitDateRange,
  integerOption,
} from './site-diagnostics/quick-wins-report-input.js'

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

export function resolveQueryOpportunityInput(
  input: QueryOpportunityInput,
  now: Date,
): ResolvedQueryOpportunityInput {
  if (!input.site.trim()) {
    throw new SeoError('INVALID_INPUT', 'site must not be empty.')
  }
  const days = integerOption({
    value: input.days,
    fallback: 28,
    minimum: 1,
    maximum: 548,
    label: 'days',
  })
  const explicit = explicitDateRange(input, 548)
  if (explicit && input.days !== undefined) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use either days or an explicit startDate/endDate range, not both.',
    )
  }
  const range = explicit?.range ?? defaultDateRange(days, now)
  const latestFinalDate = defaultDateRange(1, now).endDate
  const pacificToday = new Date(`${latestFinalDate}T00:00:00.000Z`)
  pacificToday.setUTCDate(pacificToday.getUTCDate() + 4)
  const earliestDate = subtractCalendarMonths(
    pacificToday.toISOString().slice(0, 10),
    16,
  )
  if (range.endDate > latestFinalDate) {
    throw new SeoError(
      'INVALID_INPUT',
      `endDate must be on or before the latest finalized GSC date, ${latestFinalDate}.`,
    )
  }
  if (range.startDate < earliestDate) {
    throw new SeoError(
      'INVALID_INPUT',
      `startDate must be on or after ${earliestDate}, the current 16-month GSC retention boundary.`,
    )
  }
  return {
    days: explicit?.days ?? days,
    range,
    availableDateWindow: { earliestDate, latestFinalDate },
    limit: integerOption({
      value: input.limit,
      fallback: 25,
      minimum: 1,
      maximum: 100,
      label: 'limit',
    }),
    minImpressions: integerOption({
      value: input.minImpressions,
      fallback: 20,
      minimum: 0,
      maximum: 1_000_000_000,
      label: 'minImpressions',
    }),
    maxRows: integerOption({
      value: input.maxRows,
      fallback: 50_000,
      minimum: 1,
      maximum: 50_000,
      label: 'maxRows',
    }),
  }
}
