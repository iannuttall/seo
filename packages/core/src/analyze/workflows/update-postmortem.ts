import {
  clusterPseoTemplates,
  type PseoTemplateCluster,
  templateForUrl,
} from '../pseo/templates.js'
import { type SegmentImpactItem, segmentImpact } from '../segment-impact.js'
import { updateCorrelation } from '../traffic-anomaly.js'
import { workflowReport } from './report.js'
import { splitSegments } from './segments.js'
import type { WorkflowAction, WorkflowReport } from './types.js'

type SplitSegment = ReturnType<typeof splitSegments>

type PostmortemInsight = {
  dimension: 'page' | 'query' | 'device' | 'country'
  dataStatus: SplitSegment['dataStatus']
  coverage: SplitSegment['coverage']
  unmatchedRows: number
  summary: string
  winner?: SegmentImpactItem
  loser?: SegmentImpactItem
}

type TemplateMovement = {
  signature: string
  direction: 'winner' | 'loser'
  confidence: 'high' | 'medium'
  urlCount: number
  clickDelta: number
  impressionDelta: number
  movementShare: number
  movementShareScope: 'returned-directional-page-click-movement'
  confidenceScope: 'pattern-within-returned-matched-retained-page-segments'
  segmentCoverage: SplitSegment['coverage']
  commonTerms: string[]
  sampleUrls: string[]
  summary: string
}

type PostmortemOutput = {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  insights: PostmortemInsight[]
  templateMovement: TemplateMovement[]
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function coverageSummary(coverage: SplitSegment['coverage']): string {
  return `${coverage.returnedRows} of ${coverage.eligibleRows} eligible matched retained rows returned under result limit ${coverage.resultLimit}${coverage.sourcePossiblyTruncated ? `; at least one source window reached the ${coverage.sourceRowLimit}-row source limit` : ''}`
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
  if (segment.dataStatus === 'unavailable' || segment.dataStatus === 'empty') {
    return {
      dimension,
      dataStatus: segment.dataStatus,
      coverage: segment.coverage,
      unmatchedRows: segment.summary.unmatchedRows,
      summary: `${dimension}: no matched retained segment movement was available. ${segment.summary.verdict} Scope: ${coverageSummary(segment.coverage)}.`,
    }
  }
  const evidenceSuffix =
    segment.dataStatus === 'partial'
      ? ` Evidence is partial; ${segment.summary.unmatchedRows} one-window rows were not treated as zero.`
      : ''
  const coverageSuffix = ` Scope: ${coverageSummary(segment.coverage)}.`
  const winner = segment.winners[0]
  const loser = segment.losers[0]
  if (winner && loser) {
    return {
      dimension,
      dataStatus: segment.dataStatus,
      coverage: segment.coverage,
      unmatchedRows: segment.summary.unmatchedRows,
      winner,
      loser,
      summary: `${dimension}: top winner ${segmentLabel(dimension, winner)} ${directionLabel(winner)} ${formatMagnitude(winner.clickDelta)} clicks; top loser ${segmentLabel(dimension, loser)} ${directionLabel(loser)} ${formatMagnitude(loser.clickDelta)} clicks.${evidenceSuffix}${coverageSuffix}`,
    }
  }
  if (winner) {
    return {
      dimension,
      dataStatus: segment.dataStatus,
      coverage: segment.coverage,
      unmatchedRows: segment.summary.unmatchedRows,
      winner,
      summary: `${dimension}: top winner ${segmentLabel(dimension, winner)} ${directionLabel(winner)} ${formatMagnitude(winner.clickDelta)} clicks; no material loser appeared in the returned segment rows.${evidenceSuffix}${coverageSuffix}`,
    }
  }
  if (loser) {
    return {
      dimension,
      dataStatus: segment.dataStatus,
      coverage: segment.coverage,
      unmatchedRows: segment.summary.unmatchedRows,
      loser,
      summary: `${dimension}: top loser ${segmentLabel(dimension, loser)} ${directionLabel(loser)} ${formatMagnitude(loser.clickDelta)} clicks; no material winner appeared in the returned segment rows.${evidenceSuffix}${coverageSuffix}`,
    }
  }
  return {
    dimension,
    dataStatus: segment.dataStatus,
    coverage: segment.coverage,
    unmatchedRows: segment.summary.unmatchedRows,
    summary: `${dimension}: no material winner or loser appeared in the returned matched retained segment rows.${evidenceSuffix}${coverageSuffix}`,
  }
}

function buildSummary(input: {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  insights: PostmortemInsight[]
}): string {
  const page = input.insights.find((item) => item.dimension === 'page')
  const query = input.insights.find((item) => item.dimension === 'query')
  const pageMovement =
    page?.dataStatus === 'empty' || page?.dataStatus === 'unavailable'
      ? 'page segment evidence unavailable'
      : page?.winner
        ? `top returned page gained ${formatMagnitude(page.winner.clickDelta)} clicks`
        : page?.loser
          ? `top returned page lost ${formatMagnitude(page.loser.clickDelta)} clicks`
          : 'no material page movement found in returned rows'
  const queryMovement =
    query?.dataStatus === 'empty' || query?.dataStatus === 'unavailable'
      ? 'query segment evidence unavailable'
      : query?.winner
        ? `top returned query gained ${formatMagnitude(query.winner.clickDelta)} clicks`
        : query?.loser
          ? `top returned query lost ${formatMagnitude(query.loser.clickDelta)} clicks`
          : 'no material query movement found in returned rows'

  return `Cause not established; ${pageMovement}; ${queryMovement}.`
}

function buildActions(input: {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  segments: PostmortemOutput['segments']
  templateMovement: TemplateMovement[]
}): WorkflowAction[] {
  const actions: WorkflowAction[] = []
  const pageWinners = input.segments.page.winners.length
  const pageLosers = input.segments.page.losers.length
  const queryWinners = input.segments.query.winners.length
  const queryLosers = input.segments.query.losers.length

  const topTemplate = input.templateMovement[0]

  if (topTemplate) {
    actions.push({
      title: `${topTemplate.direction === 'winner' ? 'Protect' : 'Fix'} ${topTemplate.signature}`,
      action:
        topTemplate.direction === 'winner'
          ? `${topTemplate.signature} is a repeated winning URL pattern across ${topTemplate.urlCount} URLs in the returned matched-retained page subset. Preserve the shared title/H1/content/internal-link pattern before making broad edits.`
          : `${topTemplate.signature} is a repeated losing URL pattern across ${topTemplate.urlCount} URLs in the returned matched-retained page subset. Check indexability, canonical/robots state, internal links, and whether the shared template still matches search intent.`,
      confidence: topTemplate.confidence,
    })
  }

  if (input.update.confounders.length > 0) {
    actions.push({
      title: 'Test overlapping site changes first',
      action:
        'Start with the known overlapping changes, then compare changed sections against unchanged sections. Keep the Google update window as timing context, not a cause.',
      confidence: 'medium',
    })
  } else if (
    input.update.classification === 'significant-movement-with-update-overlap'
  ) {
    actions.push({
      title: 'Map movement by template',
      action:
        'Group the top page and query movers into templates or content types. Preserve winning patterns and investigate losing templates, but do not treat timing overlap as proof of an update effect.',
      confidence: 'medium',
    })
  } else {
    actions.push({
      title: 'Treat this as exploratory',
      action:
        'Use the segment splits as a triage view, but do not over-attribute the movement to a Google update yet.',
      confidence: 'low',
    })
  }

  if (pageWinners > 0 && pageLosers === 0) {
    actions.push({
      title: 'Protect the winning pages',
      action:
        'The returned page split contains positive movers and no negative movers. Check those pages for common query intent, title/H1 pattern, internal links, and template shape before making broad edits.',
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
        'The returned query split contains positive movers and no negative movers. Use that query wording to improve internal anchors and supporting copy on related pages.',
      confidence: 'medium',
    })
  }

  return actions
}

function sameDirectionItems(
  items: SegmentImpactItem[],
  direction: TemplateMovement['direction'],
): SegmentImpactItem[] {
  return items.filter((item) =>
    direction === 'winner' ? item.clickDelta > 0 : item.clickDelta < 0,
  )
}

function movementRows(input: {
  items: SegmentImpactItem[]
  clusters: PseoTemplateCluster[]
}) {
  const grouped = new Map<
    string,
    {
      cluster?: PseoTemplateCluster
      signature: string
      items: SegmentImpactItem[]
      clickDelta: number
      impressionDelta: number
    }
  >()
  for (const item of input.items) {
    const signature = templateForUrl(item.key, input.clusters)
    if (signature === '/') continue
    const cluster = input.clusters.find((item) => item.signature === signature)
    const existing = grouped.get(signature) ?? {
      cluster,
      signature,
      items: [],
      clickDelta: 0,
      impressionDelta: 0,
    }
    existing.items.push(item)
    existing.clickDelta += item.clickDelta
    existing.impressionDelta += item.impressionDelta
    grouped.set(signature, existing)
  }
  return [...grouped.values()]
}

function clusterCommonTerms(cluster?: PseoTemplateCluster): string[] {
  if (!cluster) return []
  return [
    ...new Set(
      cluster.shape.variableSegments.flatMap(
        (segment) => segment.tokenExamples,
      ),
    ),
  ].slice(0, 6)
}

function templateMovementForDirection(input: {
  direction: TemplateMovement['direction']
  items: SegmentImpactItem[]
  clusters: PseoTemplateCluster[]
  totalMovement: number
  segmentCoverage: SplitSegment['coverage']
}): TemplateMovement[] {
  const rows = movementRows({
    items: sameDirectionItems(input.items, input.direction),
    clusters: input.clusters,
  })
  return rows
    .map((row): TemplateMovement | undefined => {
      const movement = Math.abs(row.clickDelta)
      const movementShare = input.totalMovement
        ? movement / input.totalMovement
        : 0
      if (row.items.length < 3 || movementShare < 0.2) return undefined
      const confidence: TemplateMovement['confidence'] =
        row.items.length >= 10 &&
        movementShare >= 0.35 &&
        input.segmentCoverage.limitedRows === 0 &&
        !input.segmentCoverage.sourcePossiblyTruncated
          ? 'high'
          : 'medium'
      const directionWord = input.direction === 'winner' ? 'gained' : 'lost'
      const commonTerms = clusterCommonTerms(row.cluster)
      const termText = commonTerms.length
        ? ` Common URL terms: ${commonTerms.join(', ')}.`
        : ''
      return {
        signature: row.signature,
        direction: input.direction,
        confidence,
        urlCount: row.items.length,
        clickDelta: Number(row.clickDelta.toFixed(3)),
        impressionDelta: Number(row.impressionDelta.toFixed(3)),
        movementShare: Number(movementShare.toFixed(3)),
        movementShareScope: 'returned-directional-page-click-movement',
        confidenceScope:
          'pattern-within-returned-matched-retained-page-segments',
        segmentCoverage: input.segmentCoverage,
        commonTerms,
        sampleUrls: row.items.slice(0, 5).map((item) => item.key),
        summary: `${row.signature} ${directionWord} ${formatMagnitude(row.clickDelta)} clicks across ${row.items.length} moved URLs (${formatPercent(movementShare)} of returned ${input.direction} page click movement). Coverage: ${input.segmentCoverage.returnedRows} of ${input.segmentCoverage.eligibleRows} eligible matched retained page rows returned under result limit ${input.segmentCoverage.resultLimit}.${termText}`,
      }
    })
    .filter((item): item is TemplateMovement => Boolean(item))
    .sort(
      (a, b) =>
        Math.abs(b.clickDelta) - Math.abs(a.clickDelta) ||
        b.urlCount - a.urlCount ||
        compareText(a.signature, b.signature),
    )
}

export function inferTemplateMovement(
  pageSegment: Pick<SplitSegment, 'winners' | 'losers' | 'coverage'>,
): TemplateMovement[] {
  const movedPages = [...pageSegment.winners, ...pageSegment.losers]
    .filter((item) => item.key.startsWith('http'))
    .filter((item) => Math.abs(item.clickDelta) > 0)
    .sort(
      (left, right) =>
        Math.abs(right.clickDelta) - Math.abs(left.clickDelta) ||
        compareText(left.key, right.key),
    )
  if (movedPages.length < 6) return []

  const clusters = clusterPseoTemplates(
    movedPages.map((item) => item.key),
    { minUrls: 3, minShare: 0.15, limit: 20 },
  ).filter((cluster) => cluster.signature !== '/' && cluster.urlCount >= 3)
  if (!clusters.length) return []

  const winnerMovement = pageSegment.winners.reduce(
    (sum, item) => sum + Math.max(0, item.clickDelta),
    0,
  )
  const loserMovement = Math.abs(
    pageSegment.losers.reduce(
      (sum, item) => sum + Math.min(0, item.clickDelta),
      0,
    ),
  )

  return [
    ...templateMovementForDirection({
      direction: 'winner',
      items: movedPages,
      clusters,
      totalMovement: winnerMovement,
      segmentCoverage: pageSegment.coverage,
    }),
    ...templateMovementForDirection({
      direction: 'loser',
      items: movedPages,
      clusters,
      totalMovement: loserMovement,
      segmentCoverage: pageSegment.coverage,
    }),
  ].slice(0, 6)
}

export async function updatePostmortemWorkflow(
  input: {
    site: string
    days?: number
    recentDays?: number
    limit?: number
    brandTerms?: string[]
    includeBrand?: boolean
    knownConfounders?: string[]
    includeChangeLog?: boolean
    refresh?: boolean
  },
  dependencies: {
    updateCorrelation?: typeof updateCorrelation
    segmentImpact?: typeof segmentImpact
  } = {},
): Promise<WorkflowReport<PostmortemOutput>> {
  const limit = input.limit ?? 20
  const runUpdateCorrelation =
    dependencies.updateCorrelation ?? updateCorrelation
  const runSegmentImpact = dependencies.segmentImpact ?? segmentImpact
  const [update, page, query, device, country] = await Promise.all([
    runUpdateCorrelation(input),
    runSegmentImpact({ ...input, dimension: 'page', limit }),
    runSegmentImpact({ ...input, dimension: 'query', limit }),
    runSegmentImpact({ ...input, dimension: 'device', limit }),
    runSegmentImpact({ ...input, dimension: 'country', limit }),
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
  const templateMovement = inferTemplateMovement(segments.page)
  const segmentStepStatus = [
    segments.page,
    segments.query,
    segments.device,
    segments.country,
  ].every(
    (segment) =>
      segment.dataStatus === 'empty' || segment.dataStatus === 'unavailable',
  )
    ? 'skipped'
    : 'completed'

  return workflowReport({
    workflow: 'update-postmortem',
    site: input.site,
    summary: buildSummary({ update, insights }),
    steps: [
      {
        tool: 'seo_update_correlate',
        status: 'completed',
        summary: `Cause not established. ${update.summary}`,
      },
      {
        tool: 'seo_segment_impact',
        status: segmentStepStatus,
        summary: insights.map((insight) => insight.summary).join(' '),
      },
    ],
    actions: buildActions({ update, segments, templateMovement }),
    output: { update, insights, templateMovement, segments },
  })
}
