import Table from 'cli-table3'
import {
  type TerminalContext,
  truncateText,
  visibleWidth,
  wrapText,
} from './context.js'

export type TerminalCell = string | number
export type TerminalRow = TerminalCell[]

type TableOptions = {
  layout?: 'auto' | 'records' | 'table'
  rowNumbers?: boolean
}

type Callout = {
  body?: string
  command?: string
  title: string
}

const borderlessChars = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: '',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: '',
}

function stringCell(value: TerminalCell | undefined): string {
  return value === undefined ? '' : String(value)
}

function naturalColumnWidths(head: string[], rows: TerminalRow[]): number[] {
  return head.map((label, column) => {
    const values = rows.map((row) => stringCell(row[column]))
    return Math.min(
      42,
      Math.max(visibleWidth(label), ...values.map(visibleWidth), 4),
    )
  })
}

function canRenderTable(
  head: string[],
  rows: TerminalRow[],
  context: TerminalContext,
): boolean {
  if (head.length === 0 || head.length > 4) return false
  const widths = naturalColumnWidths(head, rows)
  const tableWidth = widths.reduce((total, width) => total + width + 2, 0)
  return tableWidth <= context.columns
}

function renderDenseTable(
  head: string[],
  rows: TerminalRow[],
  context: TerminalContext,
): string {
  const widths = naturalColumnWidths(head, rows).map((width) => width + 2)
  const table = new Table({
    chars: borderlessChars,
    colWidths: widths,
    head: head.map((label) => context.colors.bold(label)),
    style: {
      border: [],
      head: [],
      'padding-left': 0,
      'padding-right': 2,
    },
    wordWrap: false,
  })
  for (const row of rows) {
    table.push(
      head.map((_, column) =>
        wrapText(
          stringCell(row[column]),
          Math.max(1, (widths[column] ?? 3) - 2),
        ).join('\n'),
      ),
    )
  }
  return table.toString()
}

function renderRecordValue(
  label: string,
  value: string,
  labelWidth: number,
  context: TerminalContext,
): string[] {
  const gap = 2
  const valueWidth = context.columns - labelWidth - gap
  if (valueWidth < 24) {
    return [
      context.colors.dim(label),
      ...wrapText(value, context.columns - 2).map((line) => `  ${line}`),
    ]
  }
  const wrapped = wrapText(value, valueWidth)
  return wrapped.map((line, index) => {
    const prefix =
      index === 0 ? label.padEnd(labelWidth) : ''.padEnd(labelWidth)
    return `${context.colors.dim(prefix)}${' '.repeat(gap)}${line}`
  })
}

export function renderRecords(
  head: string[],
  rows: TerminalRow[],
  context: TerminalContext,
  options: { rowNumbers?: boolean } = {},
): string {
  const labelWidth = Math.min(
    28,
    Math.max(...head.map((label) => visibleWidth(label)), 0),
  )
  const showNumbers = options.rowNumbers ?? rows.length > 1
  const digits = String(rows.length).length
  const blocks = rows.map((row, index) => {
    const lines: string[] = []
    if (showNumbers) {
      lines.push(context.colors.bold(String(index + 1).padStart(digits, '0')))
    }
    for (const [column, label] of head.entries()) {
      lines.push(
        ...renderRecordValue(
          label,
          stringCell(row[column]),
          labelWidth,
          context,
        ),
      )
    }
    return lines.join('\n')
  })
  return blocks.join('\n\n')
}

export function renderTable(
  head: string[],
  rows: TerminalRow[],
  context: TerminalContext,
  options: TableOptions = {},
): string {
  if (rows.length === 0) return context.colors.dim('No results.')
  const useTable =
    options.layout === 'table' ||
    (options.layout !== 'records' && canRenderTable(head, rows, context))
  return useTable
    ? renderDenseTable(head, rows, context)
    : renderRecords(head, rows, context, options)
}

export function renderKeyValues(
  rows: Array<[string, string]>,
  context: TerminalContext,
): string {
  if (rows.length === 0) return ''
  const labelWidth = Math.min(
    28,
    Math.max(...rows.map(([label]) => visibleWidth(label))),
  )
  return rows
    .flatMap(([label, value]) => {
      const lines = renderRecordValue(label, value, labelWidth, context)
      if (lines.length > 0) {
        const first = lines[0] ?? ''
        lines[0] = first.replace(label, context.colors.bold(label))
      }
      return lines
    })
    .join('\n')
}

export function renderCallout(
  callout: Callout,
  context: TerminalContext,
): string {
  const lines = [context.colors.bold(callout.title)]
  if (callout.body) lines.push(...wrapText(callout.body, context.columns))
  if (callout.command) {
    lines.push(
      context.colors.cyan(truncateText(callout.command, context.columns)),
    )
  }
  return lines.join('\n')
}
