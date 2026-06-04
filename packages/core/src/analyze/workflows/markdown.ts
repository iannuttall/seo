import { type WorkflowTable, workflowPresentation } from './presentation.js'
import type { WorkflowReport } from './types.js'

function tableCell(value: unknown): string {
  return String(value ?? '-')
    .replaceAll('\n', ' ')
    .replaceAll('|', '\\|')
}

function truncate(value: unknown, maxLength = 120): string {
  const text = tableCell(value).trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}...`
}

function formatTitle(title: string): string {
  return `## ${title}`
}

function renderTable(table: WorkflowTable): string[] {
  const headers = table.columns.map((column) => tableCell(column.label))
  const dividers = table.columns.map((column) =>
    column.type === 'number' ? '---:' : '---',
  )
  return [
    formatTitle(table.title),
    '',
    `| ${headers.join(' | ')} |`,
    `| ${dividers.join(' | ')} |`,
    ...table.rows.map((row) =>
      [
        '',
        ...table.columns.map((column) => truncate(row[column.key])),
        '',
      ].join(' | '),
    ),
    '',
  ]
}

export function renderWorkflowMarkdown(
  report: WorkflowReport<unknown>,
  options: { queueLimit?: number } = {},
): string {
  const presentation = workflowPresentation(report, options)
  const lines = [
    `# ${report.workflow}`,
    '',
    `Property: ${report.site}`,
    `Generated: ${report.generatedAt}`,
    '',
    report.summary,
    '',
    ...presentation.tables.flatMap(renderTable),
  ]
  return lines.join('\n').trim()
}
