import { segmentImpact } from '../segment-impact.js'
import { updateCorrelation } from '../traffic-anomaly.js'
import { workflowReport } from './report.js'
import { splitSegments } from './segments.js'
import type { WorkflowReport } from './types.js'

export async function updatePostmortemWorkflow(input: {
  site: string
  days?: number
  recentDays?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}): Promise<
  WorkflowReport<{
    update: Awaited<ReturnType<typeof updateCorrelation>>
    segments: {
      page: ReturnType<typeof splitSegments>
      query: ReturnType<typeof splitSegments>
      device: ReturnType<typeof splitSegments>
      country: ReturnType<typeof splitSegments>
    }
  }>
> {
  const limit = input.limit ?? 20
  const [update, page, query, device, country] = await Promise.all([
    updateCorrelation(input),
    segmentImpact({ ...input, dimension: 'page', limit }),
    segmentImpact({ ...input, dimension: 'query', limit }),
    segmentImpact({ ...input, dimension: 'device', limit }),
    segmentImpact({ ...input, dimension: 'country', limit }),
  ])

  const segments = {
    page: splitSegments(page),
    query: splitSegments(query),
    device: splitSegments(device),
    country: splitSegments(country),
  }

  return workflowReport({
    workflow: 'update-postmortem',
    site: input.site,
    summary: `${update.classification}; ${update.overlappingUpdates.length} official update window(s) overlapped the comparison period.`,
    steps: [
      {
        tool: 'seo_update_correlate',
        status: 'completed',
        summary: `Classified movement as ${update.classification}.`,
      },
      {
        tool: 'seo_segment_impact',
        status: 'completed',
        summary: 'Split movement by page, query, device, and country.',
      },
    ],
    actions: [
      {
        title: 'Review winners and losers',
        action:
          'Compare loser templates against winners before editing individual pages.',
        confidence:
          update.classification === 'likely-update-related' ? 'medium' : 'low',
      },
    ],
    output: { update, segments },
  })
}
