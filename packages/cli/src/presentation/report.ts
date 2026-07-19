import { type TerminalContext, wrapText } from './context.js'

export type SemanticStatus =
  | 'pass'
  | 'warning'
  | 'fail'
  | 'unknown'
  | 'info'
  | 'notApplicable'

export type SemanticDiagnostic = {
  status: SemanticStatus
  title: string
  explanation: string
  fix?: string
  evidence?: string[]
}

export type SemanticReportSection = {
  title: string
  diagnostics: SemanticDiagnostic[]
}

export type SemanticReportView = {
  title: string
  target?: string
  status: SemanticStatus
  summary: string
  metrics?: Array<{
    label: string
    value: string | number
    status?: SemanticStatus
  }>
  sections: SemanticReportSection[]
  notes?: string[]
}

function statusStyle(status: SemanticStatus, context: TerminalContext) {
  if (status === 'pass') return context.colors.green
  if (status === 'warning') return context.colors.yellow
  if (status === 'fail') return context.colors.red
  if (status === 'unknown') return context.colors.blue
  if (status === 'info') return context.colors.cyan
  return context.colors.dim
}

function statusLabel(status: SemanticStatus): string {
  if (status === 'warning') return 'WARN'
  if (status === 'notApplicable') return 'N/A'
  return status.toUpperCase()
}

function indent(value: string, spaces: number, width: number): string[] {
  const prefix = ' '.repeat(spaces)
  return wrapText(value, Math.max(1, width - spaces)).map(
    (line) => `${prefix}${line}`,
  )
}

function renderDiagnostic(
  diagnostic: SemanticDiagnostic,
  context: TerminalContext,
): string {
  const style = statusStyle(diagnostic.status, context)
  const label = style(`[${statusLabel(diagnostic.status)}]`.padEnd(10))
  const titleWidth = Math.max(1, context.columns - 10)
  const titles = wrapText(diagnostic.title, titleWidth)
  const lines = titles.map(
    (line, index) =>
      `${index === 0 ? label : ' '.repeat(10)}${context.colors.bold(line)}`,
  )
  lines.push(...indent(diagnostic.explanation, 10, context.columns))
  for (const item of diagnostic.evidence ?? []) {
    const wrapped = wrapText(item, Math.max(1, context.columns - 20))
    lines.push(
      ...wrapped.map(
        (line, index) =>
          `${' '.repeat(10)}${index === 0 ? `${context.colors.dim('Evidence')}  ` : '          '}${line}`,
      ),
    )
  }
  if (diagnostic.fix) {
    const wrapped = wrapText(diagnostic.fix, Math.max(1, context.columns - 15))
    lines.push(
      ...wrapped.map(
        (line, index) =>
          `${' '.repeat(10)}${index === 0 ? `${context.colors.cyan(context.colors.bold('Fix'))}  ` : '     '}${line}`,
      ),
    )
  }
  return lines.join('\n')
}

function renderMetrics(
  metrics: NonNullable<SemanticReportView['metrics']>,
  context: TerminalContext,
): string {
  const line = metrics
    .map((metric) => {
      const value = String(metric.value)
      const rendered = metric.status
        ? statusStyle(metric.status, context)(value)
        : context.colors.bold(value)
      return `${metric.label} ${rendered}`
    })
    .join(context.colors.dim('  ·  '))
  return wrapText(line, context.columns).join('\n')
}

export function renderSemanticReport(
  report: SemanticReportView,
  context: TerminalContext,
): string {
  const style = statusStyle(report.status, context)
  const output = [context.colors.bold(report.title)]
  if (report.target) output.push(context.colors.dim(report.target))
  output.push('')
  output.push(
    `${style(statusLabel(report.status))}  ${wrapText(report.summary, Math.max(1, context.columns - 6)).join('\n      ')}`,
  )
  if (report.metrics?.length)
    output.push(renderMetrics(report.metrics, context))

  for (const section of report.sections.filter(
    (item) => item.diagnostics.length > 0,
  )) {
    output.push('', context.colors.bold(section.title))
    output.push(
      section.diagnostics
        .map((diagnostic) => renderDiagnostic(diagnostic, context))
        .join('\n\n'),
    )
  }

  if (report.notes?.length) {
    output.push('', context.colors.bold('Notes'))
    for (const note of report.notes) {
      const lines = wrapText(note, Math.max(1, context.columns - 2))
      output.push(
        ...lines.map((line, index) => `${index === 0 ? '- ' : '  '}${line}`),
      )
    }
  }
  return output.join('\n')
}
