import { diagnoseProperty } from '../diagnose-property.js'
import { defaultDateRange } from '../shared.js'
import {
  fetchLandingPageValues,
  landingPageRankingPolicy,
  landingValueForUrl,
} from './analytics-value.js'
import { groupPriorityQueue } from './priority-grouping.js'
import { priorityCategory, scorePriority } from './priority-scoring.js'
import { workflowReport } from './report.js'
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
  templates?: Array<{ id: string; count?: number; urlCount?: number }>
  id?: string
}): number | undefined {
  const template = input.templates?.find((item) => item.id === input.id)
  return template?.urlCount ?? template?.count
}

function priorityFromDraft(
  draft: QueueDraft,
  analyticsCanRank: boolean,
): PriorityQueueItem {
  const breakdown = scorePriority({
    source: draft.source,
    impact: draft.impact,
    confidence: draft.confidence,
    effort: draft.effort,
    verification: draft.verification,
    templateCount: draft.template?.count,
    analyticsSessions: analyticsCanRank ? draft.analytics?.sessions : undefined,
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
    diagnosis: 'lost_position' | 'lost_ctr' | 'lost_impressions' | 'lost_clicks'
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
      impactKind: 'observed_retained_query_clicks',
      confidence: 'medium',
      effort: group.diagnosis === 'lost_ctr' ? 'S' : 'M',
      template: {
        id: group.template.id,
        label: group.template.label,
        count: group.count,
      },
      action: group.recommendation,
      evidence: `${group.count} matching query/page rows retained in both windows had ${group.totalClickLoss.toFixed(0)} fewer clicks. Examples: ${group.sampleQueries.slice(0, 3).join('; ')}.`,
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
  const analyticsPolicy = landingPageRankingPolicy({
    propertyId: input.ga4PropertyId,
    source: analytics.source,
    warning: analytics.warning,
  })
  const warnings = analyticsPolicy.warnings
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
      impact: item.priority.score,
      impactKind: 'heuristic_priority_score',
      confidence: item.recommendation.confidence,
      verification: item.contentVerification?.classification,
      template: {
        id: item.template.id,
        label: item.template.label,
        count: templateItems ?? 1,
      },
      analytics: landingValue,
      action: item.recommendation.action,
      evidence: item.recommendation.evidence,
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
      impact: Number(item.estimatedCtrClickShortfall.toFixed(2)),
      impactKind: 'heuristic_ctr_click_shortfall',
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
      impactKind: 'observed_retained_query_clicks',
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
    drafts.push({
      source: 'cannibalization',
      title: item.query,
      target: item.suggestedOwnerUrl,
      impact: item.priority.score,
      impactKind: 'heuristic_multi_url_exposure',
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
      impactKind: 'ordinal',
      confidence: item.confidence,
      action: item.action,
      evidence: item.reason,
    })
  }

  for (const template of diagnosis.quickWins.templateRecommendations) {
    drafts.push({
      source: 'template',
      title: `${template.templateLabel} opportunity template`,
      target: `${template.templateLabel} template (${template.urlCount} URLs)`,
      impact: template.totalEstimatedCtrClickShortfall,
      impactKind: 'heuristic_ctr_click_shortfall',
      confidence: 'medium',
      effort: 'M',
      template: {
        id: template.templateId,
        label: template.templateLabel,
        count: template.urlCount,
      },
      action: template.action,
      evidence: template.evidence,
    })
  }

  const ranked = groupPriorityQueue(
    drafts
      .map((draft) => priorityFromDraft(draft, analyticsPolicy.canRank))
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
    output: {
      queue: ranked,
      warnings,
      diagnosis,
      analyticsSource: analytics.source,
      analyticsRankingEligible: analyticsPolicy.canRank,
      analyticsRankingApplied: ranked.some(
        (item) => item.scoreBreakdown.analytics > 1,
      ),
    },
  })
}
