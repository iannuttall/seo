import { SeoError } from '../../errors.js'

export function integerOption(input: {
  value: number | undefined
  fallback: number
  minimum: number
  maximum: number
  label: string
}): number {
  if (input.value === undefined) return input.fallback
  if (
    !Number.isInteger(input.value) ||
    input.value < input.minimum ||
    input.value > input.maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be a whole number between ${input.minimum} and ${input.maximum}.`,
    )
  }
  return input.value
}

export function defaultDateRange(
  days: number,
  now: Date,
): { startDate: string; endDate: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  const endDate = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  )
  endDate.setUTCDate(endDate.getUTCDate() - 4)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  }
}

export function explicitDateRange(
  input: { startDate?: string; endDate?: string },
  maximumDays: number,
): { range: { startDate: string; endDate: string }; days: number } | undefined {
  if (!input.startDate && !input.endDate) return undefined
  if (!input.startDate || !input.endDate) {
    throw new SeoError(
      'INVALID_INPUT',
      'Start date and end date must be provided together.',
    )
  }
  const pattern = /^\d{4}-\d{2}-\d{2}$/
  const start = new Date(`${input.startDate}T00:00:00.000Z`)
  const end = new Date(`${input.endDate}T00:00:00.000Z`)
  if (
    !pattern.test(input.startDate) ||
    !pattern.test(input.endDate) ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.toISOString().slice(0, 10) !== input.startDate ||
    end.toISOString().slice(0, 10) !== input.endDate ||
    start > end
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Start date and end date must be valid YYYY-MM-DD values in ascending order.',
    )
  }
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days > maximumDays) {
    throw new SeoError(
      'INVALID_INPUT',
      `Date range must not exceed ${maximumDays} days.`,
    )
  }
  return {
    range: { startDate: input.startDate, endDate: input.endDate },
    days,
  }
}
