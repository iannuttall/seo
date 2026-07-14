import { truncateText } from '../presentation/context.js'
import { printTable } from '../utils.js'

const HUMAN_ROW_LIMIT = 25
type TableRow = Array<string | number>
type ActionDetail = {
  label: string
  action: string
  context?: string
}

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
  return truncateText(value, maxLength)
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

export function printActionDetails(
  title: string,
  actions: ActionDetail[],
  limit = 5,
): void {
  const visible = actions
    .filter((item) => item.action.trim().length > 0)
    .slice(0, limit)
  if (!visible.length) return

  process.stdout.write(`\n${title}\n`)
  for (const [index, item] of visible.entries()) {
    const context = item.context ? ` (${item.context})` : ''
    process.stdout.write(
      `${index + 1}. ${item.label}${context}: ${item.action}\n`,
    )
  }
  if (actions.length > visible.length) {
    process.stdout.write(
      `Showing ${visible.length} of ${actions.length}. Use --json for full data.\n`,
    )
  }
}

export function printNextCommand(command: string): void {
  process.stdout.write(`\nNext: ${command}\n`)
}

export function printNotes(title: string, notes: string[]): void {
  const visible = notes.filter((note) => note.trim().length > 0)
  if (!visible.length) return
  process.stdout.write(`\n${title}\n`)
  for (const note of visible) {
    process.stdout.write(`- ${note}\n`)
  }
}
