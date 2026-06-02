import { diagnoseProperty } from '../diagnose-property.js'
import { defaultDateRange } from '../shared.js'
import {
  fetchLandingPageValues,
  landingValueForUrl,
} from './analytics-value.js'
import { groupPriorityQueue } from './priority-grouping.js'
import { priorityCategory, scorePriority } from './priority-scoring.js'
import { workflowReport } from './report.js'
import { templateOpportunityRecommendation } from './template-recommendations.js'
import type { PriorityQueueItem, WorkflowReport } from './types.js'

type QueueDraft = Omit<
  PriorityQueueItem,
  'category' | 'score' | 'impact' | 'scoreBreakdown'
> & {
  impact: number
  effort?: 'S' | 'M' | 'L'
  verification?: Parameters<typeof priorityCategory>[1]
}

function templateCount(input: {
  templates?: Array<{ id: string; count: number }>
  id?: string
}): number | undefined {
  return input.templates?.find((template) => template.id === input.id)?.count
}

function priorityFromDraft(draft: QueueDraft): PriorityQueueItem {
  const breakdown = scorePriority({
    source: draft.source,
    impact: draft.impact,
    confidence: draft.confidence,
    effort: draft.effort,
    verification: draft.verification,
    templateCount: draft.template?.count,
    analyticsSessions: draft.analytics?.sessions,
  })
  return {
    ...draft,
    category: priorityCategory(draft.source, draft.verification),
    score: breakdown.final,
    scoreBreakdown: breakdown,
  }
}

export function decayClusterDrafts(input: {
  groups: Array<{
    label: string
    diagnosis:
      | 'lost_visibility'
      | 'lost_position'
      | 'lost_ctr'
      | 'lost_impressions'
    count: number
    totalClickLoss: number
    template: { id: string; label: string }
    sampleUrls: string[]
    sampleQueries: string[]
    recommendation: string
  }>
  site: string
}): QueueDraft[] {
  return input.groups
    .filter((item) => item.count >= 3 || item.totalClickLoss >= 10)
    .map((group) => ({
      source: 'decay',
      title: `${group.label} cluster`,
      target: group.sampleUrls[0] ?? input.site,
      impact: group.totalClickLoss,
      confidence: group.diagnosis === 'lost_visibility' ? 'high' : 'medium',
      effort: group.diagnosis === 'lost_ctr' ? 'S' : 'M',
      template: {
        id: group.template.id,
        label: group.template.label,
        count: group.count,
      },
      action: group.recommendation,
      evidence: `${group.count} matching decay findings lost ${group.totalClickLoss.toFixed(0)} clicks versus the previous window. Examples: ${group.sampleQueries.slice(0, 3).join('; ')}.`,
    }))
}

export async function refreshPrioritiesWorkflow(input: {
  site: string
  days?: number
  recentDays?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  ga4PropertyId?: string
  verifyContent?: boolean
  verifyLimit?: number
  refresh?: boolean
}): Promise<
  WorkflowReport<{
    queue: PriorityQueueItem[]
    warnings: string[]
    diagnosis: Awaited<ReturnType<typeof diagnoseProperty>>
  }>
> {
  const diagnosis = await diagnoseProperty({
    ...input,
    verifyContent: input.verifyContent ?? true,
    verifyLimit: input.verifyLimit ?? Math.min(input.limit ?? 5, 5),
  })
  const range = defaultDateRange(input.days ?? 28)
  const analytics = await fetchLandingPageValues({
    propertyId: input.ga4PropertyId,
    startDate: range.startDate,
    endDate: range.endDate,
  })
  const warnings = analytics.warning ? [`GA4: ${analytics.warning}`] : []
  const drafts: QueueDraft[] = []
  const opportunityCandidateLimit = Math.max(input.limit ?? 25, 25)

  for (const item of diagnosis.strikingDistance.items) {
    const templateItems = templateCount({
      templates: diagnosis.strikingDistance.templates,
      id: item.template.id,
    })
    const landingValue = landingValueForUrl(analytics.values, item.url)
    drafts.push({
      source: 'striking-distance',
      title: item.query,
      target: item.url,
      impact: item.opportunityScore,
      confidence: 'high',
      template: {
        id: item.template.id,
        label: item.template.label,
        count: templateItems ?? 1,
      },
      analytics: landingValue,
      action: item.action,
      evidence: `${item.impressions} impressions at position ${item.position}.`,
    })
  }

  for (const item of diagnosis.quickWins.items.slice(
    0,
    opportunityCandidateLimit,
  )) {
    const templateItems = templateCount({
      templates: diagnosis.quickWins.templates,
      id: item.template.id,
    })
    const landingValue = landingValueForUrl(analytics.values, item.url)
    drafts.push({
      source: 'quick-win',
      title: item.query,
      target: item.url,
      impact: Number(item.estimatedClickLift.toFixed(2)),
      confidence: item.recommendation.confidence,
      effort: item.recommendation.effort,
      verification: item.contentVerification?.classification,
      template: {
        id: item.template.id,
        label: item.template.label,
        count: templateItems ?? 1,
      },
      analytics: landingValue,
      action: item.recommendation.action,
      evidence: item.recommendation.evidenceRef,
    })
  }

  for (const item of diagnosis.decay.items) {
    const templateItems = templateCount({
      templates: diagnosis.decay.templates,
      id: item.template.id,
    })
    const landingValue = landingValueForUrl(analytics.values, item.url)
    drafts.push({
      source: 'decay',
      title: item.query,
      target: item.url,
      impact: item.clickLoss,
      confidence: item.recommendation.confidence,
      effort: item.recommendation.effort,
      template: {
        id: item.template.id,
        label: item.template.label,
        count: templateItems ?? 1,
      },
      analytics: landingValue,
      action: item.recommendation.action,
      evidence: item.recommendation.evidenceRef,
    })
  }

  drafts.push(
    ...decayClusterDrafts({
      groups: diagnosis.decay.groups,
      site: input.site,
    }),
  )

  for (const item of diagnosis.cannibalization.items) {
    const impressions = item.pages.reduce(
      (sum, page) => sum + page.impressions,
      0,
    )
    drafts.push({
      source: 'cannibalization',
      title: item.query,
      target: item.ownerUrl,
      impact: Number((impressions * (1 - item.hhi)).toFixed(2)),
      confidence: item.recommendation.confidence,
      effort: item.recommendation.effort,
      template: item.template
        ? {
            id: item.template.id,
            label: item.template.label,
            count: item.pages.length,
          }
        : undefined,
      action: item.recommendation.action,
      evidence: item.recommendation.evidenceRef,
    })
  }

  for (const item of diagnosis.priorities) {
    drafts.push({
      source: 'diagnosis',
      title: item.label,
      target: input.site,
      impact:
        item.confidence === 'high'
          ? 150
          : item.confidence === 'medium'
            ? 75
            : 25,
      confidence: item.confidence,
      action: item.action,
      evidence: item.reason,
    })
  }

  for (const template of diagnosis.quickWins.templates.filter(
    (item) => item.id !== 'other' && item.count >= 3,
  )) {
    const templateItems = diagnosis.quickWins.items.filter(
      (item) => item.template.id === template.id,
    )
    const impact = templateItems.reduce(
      (sum, item) => sum + item.estimatedClickLift,
      0,
    )
    const recommendation = templateOpportunityRecommendation({
      templateId: template.id,
      templateLabel: template.label,
      items: templateItems,
    })
    drafts.push({
      source: 'template',
      title: `${template.label} opportunity template`,
      target: template.sampleUrls[0] ?? input.site,
      impact,
      confidence: 'high',
      effort: 'M',
      template: {
        id: template.id,
        label: template.label,
        count: template.count,
      },
      action: recommendation.action,
      evidence: recommendation.evidence,
    })
  }

  const ranked = groupPriorityQueue(
    drafts
      .map(priorityFromDraft)
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score),
  ).slice(0, input.limit ?? 25)

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
    output: { queue: ranked, warnings, diagnosis },
  })
}
