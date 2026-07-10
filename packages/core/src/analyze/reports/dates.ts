import { latestFinalGscDate } from '../../gsc/dates.js'

export function rangeDays(range: {
  startDate: string
  endDate: string
}): number {
  const start = Date.parse(`${range.startDate}T00:00:00Z`)
  const end = Date.parse(`${range.endDate}T00:00:00Z`)
  return Math.floor((end - start) / 86_400_000) + 1
}

export function finalGscDate(now = new Date()): string {
  return latestFinalGscDate(now)
}

export function monthRange(
  month: string,
  now = new Date(),
): {
  startDate: string
  endDate: string
} {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Pass --month as YYYY-MM.')
  }
  const start = new Date(`${month}-01T00:00:00Z`)
  if (Number.isNaN(start.getTime())) {
    throw new Error('Pass --month as YYYY-MM.')
  }
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  end.setUTCDate(0)
  const endDate = end.toISOString().slice(0, 10)
  const availableEndDate = finalGscDate(now)
  const cappedEndDate = endDate < availableEndDate ? endDate : availableEndDate
  const startDate = start.toISOString().slice(0, 10)
  if (cappedEndDate < startDate) {
    throw new Error(
      `Final GSC data is only available through ${availableEndDate}. Choose an earlier month.`,
    )
  }
  return { startDate, endDate: cappedEndDate }
}
