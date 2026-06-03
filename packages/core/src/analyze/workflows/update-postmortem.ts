import { type SegmentImpactItem, segmentImpact } from '../segment-impact.js'
import { updateCorrelation } from '../traffic-anomaly.js'
import { workflowReport } from './report.js'
import { splitSegments } from './segments.js'
import type { WorkflowAction, WorkflowReport } from './types.js'

type SplitSegment = ReturnType<typeof splitSegments>

type PostmortemInsight = {
  dimension: 'page' | 'query' | 'device' | 'country'
  summary: string
  winner?: SegmentImpactItem
  loser?: SegmentImpactItem
}

type PostmortemOutput = {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  insights: PostmortemInsight[]
  segments: {
    page: SplitSegment
    query: SplitSegment
    device: SplitSegment
    country: SplitSegment
  }
}

function formatMagnitude(value: number): string {
  return Math.abs(value).toLocaleString('en-GB')
}

function directionLabel(item: SegmentImpactItem): string {
  if (item.clickDelta > 0) return 'gained'
  if (item.clickDelta < 0) return 'lost'
  return 'held flat'
}

function segmentLabel(
  dimension: PostmortemInsight['dimension'],
  item: SegmentImpactItem,
): string {
  if (dimension === 'page') return item.key.replace(/^https?:\/\//, '')
  return item.key
}

function insightForSegment(
  dimension: PostmortemInsight['dimension'],
  segment: SplitSegment,
): PostmortemInsight {
  const winner = segment.winners[0]
  const loser = segment.losers[0]
  if (winner && loser) {
    return {
      dimension,
      winner,
      loser,
      summary: `${dimension}: top winner ${segmentLabel(dimension, winner)} ${directionLabel(winner)} ${formatMagnitude(winner.clickDelta)} clicks; top loser ${segmentLabel(dimension, loser)} ${directionLabel(loser)} ${formatMagnitude(loser.clickDelta)} clicks.`,
    }
  }
  if (winner) {
    return {
      dimension,
      winner,
      summary: `${dimension}: top winner ${segmentLabel(dimension, winner)} ${directionLabel(winner)} ${formatMagnitude(winner.clickDelta)} clicks; no material loser appeared in the top segment rows.`,
    }
  }
  if (loser) {
    return {
      dimension,
      loser,
      summary: `${dimension}: top loser ${segmentLabel(dimension, loser)} ${directionLabel(loser)} ${formatMagnitude(loser.clickDelta)} clicks; no material winner appeared in the top segment rows.`,
    }
  }
  return {
    dimension,
    summary: `${dimension}: no material winner or loser appeared in the top segment rows.`,
  }
}

function buildSummary(input: {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  insights: PostmortemInsight[]
}): string {
  const page = input.insights.find((item) => item.dimension === 'page')
  const query = input.insights.find((item) => item.dimension === 'query')
  const pageMovement = page?.winner
    ? `top page gained ${formatMagnitude(page.winner.clickDelta)} clicks`
    : page?.loser
      ? `top page lost ${formatMagnitude(page.loser.clickDelta)} clicks`
      : 'no material page movement found'
  const queryMovement = query?.winner
    ? `top query gained ${formatMagnitude(query.winner.clickDelta)} clicks`
    : query?.loser
      ? `top query lost ${formatMagnitude(query.loser.clickDelta)} clicks`
      : 'no material query movement found'

  return `${input.update.attribution} (${input.update.confidence} confidence); ${pageMovement}; ${queryMovement}.`
}

function buildActions(input: {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  segments: PostmortemOutput['segments']
}): WorkflowAction[] {
  const actions: WorkflowAction[] = []
  const pageWinners = input.segments.page.winners.length
  const pageLosers = input.segments.page.losers.length
  const queryWinners = input.segments.query.winners.length
  const queryLosers = input.segments.query.losers.length

  if (input.update.attribution === 'confounded') {
    actions.push({
      title: 'Separate update movement from site changes',
      action:
        'Start with the known overlapping changes, then compare changed sections against unchanged sections. Do not call this an update hit until unchanged sections moved the same way.',
      confidence: 'high',
    })
  } else if (input.update.attribution === 'very-likely-update-related') {
    actions.push({
      title: 'Map update winners and losers by template',
      action:
        'Group the top page and query movers into templates or content types. Preserve the winning pattern and only fix losing templates after checking indexability, intent, and SERP changes.',
      confidence: 'high',
    })
  } else {
    actions.push({
      title: 'Treat this as exploratory',
      action:
        'Use the segment splits as a triage view, but do not over-attribute the movement to a Google update yet.',
      confidence: input.update.confidence,
    })
  }

  if (pageWinners > 0 && pageLosers === 0) {
    actions.push({
      title: 'Protect the winning pages',
      action:
        'The page split is mostly positive. Check the winning pages for common query intent, title/H1 pattern, internal links, and template shape before making broad edits.',
      confidence: 'medium',
    })
  }

  if (pageLosers > 0 || queryLosers > 0) {
    actions.push({
      title: 'Triage the largest losers first',
      action:
        'For losing pages and queries, check whether impressions dropped, average position worsened, or CTR fell. That separates ranking/index loss from snippet or SERP layout issues.',
      confidence: 'medium',
    })
  }

  if (queryWinners > 0 && queryLosers === 0) {
    actions.push({
      title: 'Expand winning query angles',
      action:
        'The query split is mostly positive. Use the winning query wording to improve internal anchors and supporting copy on related pages.',
      confidence: 'medium',
    })
  }

  return actions
}

export async function updatePostmortemWorkflow(input: {
  site: string
  days?: number
  recentDays?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  knownConfounders?: string[]
  includeChangeLog?: boolean
  refresh?: boolean
}): Promise<WorkflowReport<PostmortemOutput>> {
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
  const insights = [
    insightForSegment('page', segments.page),
    insightForSegment('query', segments.query),
    insightForSegment('device', segments.device),
    insightForSegment('country', segments.country),
  ]

  return workflowReport({
    workflow: 'update-postmortem',
    site: input.site,
    summary: buildSummary({ update, insights }),
    steps: [
      {
        tool: 'seo_update_correlate',
        status: 'completed',
        summary: `${update.attribution}; ${update.confidence} confidence. ${update.summary}`,
      },
      {
        tool: 'seo_segment_impact',
        status: 'completed',
        summary: insights.map((insight) => insight.summary).join(' '),
      },
    ],
    actions: buildActions({ update, segments }),
    output: { update, insights, segments },
  })
}
