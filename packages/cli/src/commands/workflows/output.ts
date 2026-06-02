import { printKeyValue, printTable } from '../../utils.js'
import { printActionDetails } from '../output.js'

export function printWorkflow(report: {
  workflow: string
  site: string
  summary: string
  steps: Array<{ tool: string; status: string; summary: string }>
  actions: Array<{ title: string; confidence: string; action: string }>
}): void {
  printKeyValue([
    ['Workflow', report.workflow],
    ['Property', report.site],
    ['Summary', report.summary],
  ])
  printTable(
    ['Tool', 'Status', 'Summary'],
    report.steps.map((step) => [step.tool, step.status, step.summary]),
  )
  if (report.actions.length) {
    printTable(
      ['Priority', 'Confidence', 'Action'],
      report.actions.map((action) => [
        action.title,
        action.confidence,
        action.action,
      ]),
    )
    printActionDetails(
      'Priority action details',
      report.actions.map((action) => ({
        label: action.title,
        context: action.confidence,
        action: action.action,
      })),
    )
  }
}
