export const GSC_TIME_ZONE = 'America/Los_Angeles'
export const GSC_FINAL_DATA_LAG_DAYS = 4

function dateInTimeZone(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  )
}

export function shiftIsoDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function latestFinalGscDate(now = new Date()): string {
  const pacificToday = dateInTimeZone(now, GSC_TIME_ZONE)
  pacificToday.setUTCDate(pacificToday.getUTCDate() - GSC_FINAL_DATA_LAG_DAYS)
  return pacificToday.toISOString().slice(0, 10)
}

export function finalGscDateRange(
  days = 28,
  now = new Date(),
): { startDate: string; endDate: string } {
  const endDate = latestFinalGscDate(now)
  return {
    startDate: shiftIsoDate(endDate, -(days - 1)),
    endDate,
  }
}
