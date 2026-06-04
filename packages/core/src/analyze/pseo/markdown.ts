import { renderPresentationTablesMarkdown } from '../../markdown.js'
import { countLabel } from '../../phrasing.js'
import type { PseoAuditReport } from './audit.js'
import { pseoPresentation } from './presentation.js'

export function renderPseoMarkdown(report: PseoAuditReport): string {
  const presentation = pseoPresentation(report)
  const lines = [
    `# pSEO audit: ${report.site}`,
    '',
    `Generated: ${report.generatedAt}`,
    `Window: ${report.rangeDays} days`,
    '',
    `${countLabel(report.summary.templates, 'template')} audited from ${countLabel(report.summary.gscPages, 'GSC page')}.`,
    '',
  ]
  if (report.caveats.length) {
    lines.push('## Report Caveats', '')
    lines.push(...report.caveats.map((caveat) => `- ${caveat}`), '')
  }
  lines.push(...renderPresentationTablesMarkdown(presentation.tables))
  if (report.warnings.length) {
    lines.push('## Warnings', '')
    lines.push(...report.warnings.map((warning) => `- ${warning}`))
  }
  return lines.join('\n').trim()
}
