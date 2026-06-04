import type { PresentationTable } from './presentation.js'

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

export function renderPresentationTablesMarkdown(
  tables: PresentationTable[],
): string[] {
  return tables.flatMap((table) => {
    const headers = table.columns.map((column) => tableCell(column.label))
    const dividers = table.columns.map((column) =>
      column.type === 'number' ? '---:' : '---',
    )
    return [
      `## ${table.title}`,
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
  })
}
