import { renderPresentationTablesMarkdown } from '../../markdown.js'
import { workflowPresentation } from './presentation.js'
import type { WorkflowReport } from './types.js'

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
    ...renderPresentationTablesMarkdown(presentation.tables),
  ]
  return lines.join('\n').trim()
}
