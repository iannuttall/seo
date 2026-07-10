import { latestFinalGscDate } from '../../../gsc/dates.js'

export function dateShift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function latestGscDate(now = new Date()): string {
  return latestFinalGscDate(now)
}
