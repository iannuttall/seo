import { monthlyReport } from '../reports.js'
import { workflowReport } from './report.js'
import type { WorkflowReport } from './types.js'

export async function monthlyReportWorkflow(input: {
  site: string
  month?: string
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}): Promise<
  WorkflowReport<{
    report: Awaited<ReturnType<typeof monthlyReport>>
  }>
> {
  const report = await monthlyReport(input)
  return workflowReport({
    workflow: 'monthly-report',
    site: input.site,
    summary: `Monthly report generated for ${report.month}. ${report.headline}`,
    steps: [
      {
        tool: 'seo_monthly_report',
        status: 'completed',
        summary: `Generated report for ${report.period.startDate} to ${report.period.endDate}.`,
      },
    ],
    actions: report.priorities,
    output: { report },
  })
}
