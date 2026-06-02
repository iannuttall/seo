import type { ReportNarrative } from './types.js'

export function renderMarkdown(report: ReportNarrative): string {
  const lines = [`# SEO report: ${report.site}`, '', report.headline, '']
  lines.push(`Period: ${report.period.startDate} to ${report.period.endDate}`)
  lines.push('')
  for (const section of report.sections) {
    lines.push(`## ${section.title}`)
    for (const bullet of section.bullets) {
      lines.push(`- ${bullet}`)
    }
    lines.push('')
  }
  lines.push('## Priorities')
  for (const priority of report.priorities) {
    lines.push(
      `- ${priority.title} (${priority.confidence}): ${priority.action}`,
    )
  }
  return lines.join('\n')
}
