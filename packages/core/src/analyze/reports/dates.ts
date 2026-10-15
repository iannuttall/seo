export function rangeDays(range: {
  startDate: string
  endDate: string
}): number {
  const start = Date.parse(`${range.startDate}T00:00:00Z`)
  const end = Date.parse(`${range.endDate}T00:00:00Z`)
  return Math.floor((end - start) / 86_400_000) + 1
}
