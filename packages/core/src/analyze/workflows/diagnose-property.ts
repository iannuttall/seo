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
  skipSearchData?: boolean
}): Promise<
  WorkflowReport<{
    narrative: Awaited<ReturnType<typeof reportNarrative>>
  }>
> {
  const narrative = await reportNarrative(input)
  const skippedCount = narrative.diagnosis.skippedSections?.length ?? 0
  const stepSummary = input.skipSearchData
    ? 'Skipped provider-backed search diagnosis because no Search Console property was selected.'
    : narrative.dataStatus === 'complete'
      ? 'Generated diagnosis, movement, change, and monitoring narrative.'
      : skippedCount
        ? `Generated ${narrative.dataStatus === 'unavailable' ? 'an' : 'a'} ${narrative.dataStatus} diagnosis; ${skippedCount} sections were unavailable.`
        : 'Generated a partial diagnosis because one or more source datasets were incomplete.'
  return workflowReport({
    workflow: 'diagnose-property',
    site: input.site,
    summary: narrative.headline,
    steps: [
      {
        tool: 'seo_report_narrative',
        status: input.skipSearchData ? 'skipped' : 'completed',
        summary: stepSummary,
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
