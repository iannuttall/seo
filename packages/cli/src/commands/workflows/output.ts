import { printSemanticReport } from '../../utils.js'

function stepStatus(
  value: string,
): 'pass' | 'warning' | 'fail' | 'unknown' | 'info' {
  const status = value.toLowerCase()
  if (['pass', 'passed', 'complete', 'completed', 'joined'].includes(status)) {
    return 'pass'
  }
  if (['warn', 'warning', 'partial', 'review'].includes(status)) {
    return 'warning'
  }
  if (['fail', 'failed', 'error'].includes(status)) return 'fail'
  if (['unknown', 'unavailable'].includes(status)) return 'unknown'
  return 'info'
}

export function printWorkflow(report: {
  workflow: string
  site: string
  summary: string
  steps: Array<{ tool: string; status: string; summary: string }>
  actions: Array<{ title: string; confidence: string; action: string }>
}): void {
  const statuses = report.steps.map((step) => stepStatus(step.status))
  const status = statuses.includes('fail')
    ? 'fail'
    : statuses.includes('warning')
      ? 'warning'
      : statuses.includes('unknown')
        ? 'unknown'
        : 'pass'
  printSemanticReport({
    title: report.workflow,
    target: report.site,
    status,
    summary: report.summary,
    metrics: [
      {
        label: 'Completed',
        value: statuses.filter((value) => value === 'pass').length,
        status: 'pass',
      },
      {
        label: 'Review',
        value: statuses.filter((value) => value === 'warning').length,
        status: 'warning',
      },
      {
        label: 'Unknown',
        value: statuses.filter((value) => value === 'unknown').length,
        status: 'unknown',
      },
    ],
    sections: [
      {
        title: 'Evidence collection',
        diagnostics: report.steps.map((step) => ({
          status: stepStatus(step.status),
          title: step.tool,
          explanation: step.summary,
          evidence: [`Status: ${step.status}`],
        })),
      },
      {
        title: 'Priority actions',
        diagnostics: report.actions.map((action) => ({
          status: 'warning' as const,
          title: action.title,
          explanation: `Confidence: ${action.confidence}.`,
          fix: action.action,
        })),
      },
    ],
  })
}
