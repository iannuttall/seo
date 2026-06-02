import { printTable } from '../utils.js'

const HUMAN_ROW_LIMIT = 25
type TableRow = Array<string | number>

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-GB')
}

export function formatPosition(value: number): string {
  return value.toFixed(1)
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function truncate(value: string, maxLength = 72): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

export function verificationSummary(report: {
  verification?: { requested: boolean; verified: number; failed: number }
}): string {
  if (!report.verification?.requested) return 'off'
  return `${report.verification.verified} checked, ${report.verification.failed} failed`
}

export function printLimitedTable(head: string[], rows: TableRow[]): void {
  printTable(head, rows.slice(0, HUMAN_ROW_LIMIT))
  if (rows.length > HUMAN_ROW_LIMIT) {
    process.stdout.write(
      `Showing ${HUMAN_ROW_LIMIT} of ${rows.length}. Use --json for full data.\n`,
    )
  }
}
