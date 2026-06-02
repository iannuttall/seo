import { diagnoseProperty } from '../diagnose-property.js'
import { workflowReport } from './report.js'
import type { PriorityQueueItem, WorkflowReport } from './types.js'

export async function refreshPrioritiesWorkflow(input: {
  site: string
  days?: number
  recentDays?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}): Promise<
  WorkflowReport<{
    queue: PriorityQueueItem[]
    diagnosis: Awaited<ReturnType<typeof diagnoseProperty>>
  }>
> {
  const diagnosis = await diagnoseProperty(input)
  const queue: PriorityQueueItem[] = []

  for (const item of diagnosis.strikingDistance.items) {
    queue.push({
      source: 'striking-distance',
      title: item.query,
      target: item.url,
      score: item.opportunityScore,
      confidence: 'high',
      action: item.action,
      evidence: `${item.impressions} impressions at position ${item.position}.`,
    })
  }

  for (const item of diagnosis.quickWins.items.slice(0, input.limit ?? 25)) {
    queue.push({
      source: 'quick-win',
      title: item.query,
      target: item.url,
      score: Number(item.estimatedClickLift.toFixed(2)),
      confidence: item.recommendation.confidence,
      action: item.recommendation.action,
      evidence: item.recommendation.evidenceRef,
    })
  }

  for (const item of diagnosis.decay.items) {
    const clickLoss = Math.max(0, item.previous.clicks - item.current.clicks)
    queue.push({
      source: 'decay',
      title: item.query,
      target: item.query,
      score: Number((clickLoss * 10).toFixed(2)),
      confidence: item.recommendation.confidence,
      action: item.recommendation.action,
      evidence: item.recommendation.evidenceRef,
    })
  }

  for (const item of diagnosis.cannibalization.items) {
    queue.push({
      source: 'cannibalization',
      title: item.query,
      target: item.pages[0]?.url ?? item.query,
      score: Number((item.pages.length * 50 * (1 - item.hhi)).toFixed(2)),
      confidence: item.recommendation.confidence,
      action: item.recommendation.action,
      evidence: item.recommendation.evidenceRef,
    })
  }

  for (const item of diagnosis.priorities) {
    queue.push({
      source: 'diagnosis',
      title: item.label,
      target: input.site,
      score:
        item.confidence === 'high'
          ? 250
          : item.confidence === 'medium'
            ? 100
            : 25,
      confidence: item.confidence,
      action: item.action,
      evidence: item.reason,
    })
  }

  const ranked = queue
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 25)

  return workflowReport({
    workflow: 'refresh-priorities',
    site: input.site,
    summary: `${ranked.length} ranked SEO priorities refreshed.`,
    steps: [
      {
        tool: 'seo_diagnose_property',
        status: 'completed',
        summary:
          'Combined diagnosis, decay, striking-distance, quick-win, and cannibalisation signals.',
      },
    ],
    actions: ranked.slice(0, 5).map((item) => ({
      title: item.title,
      action: item.action,
      confidence: item.confidence,
    })),
    output: { queue: ranked, diagnosis },
  })
}
