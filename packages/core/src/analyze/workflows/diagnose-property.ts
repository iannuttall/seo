import { reportNarrative } from '../reports.js'
import { workflowReport } from './report.js'
import type { WorkflowReport } from './types.js'

export async function diagnosePropertyWorkflow(input: {
  site: string
  days?: number
  recentDays?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}): Promise<
  WorkflowReport<{
    narrative: Awaited<ReturnType<typeof reportNarrative>>
  }>
> {
  const narrative = await reportNarrative(input)
  return workflowReport({
    workflow: 'diagnose-property',
    site: input.site,
    summary: narrative.headline,
    steps: [
      {
        tool: 'seo_report_narrative',
        status: 'completed',
        summary:
          'Generated diagnosis, movement, change, and monitoring narrative.',
      },
    ],
    actions: narrative.priorities.map((priority) => ({
      title: priority.title,
      action: priority.action,
      confidence: priority.confidence,
    })),
    output: { narrative },
  })
}
