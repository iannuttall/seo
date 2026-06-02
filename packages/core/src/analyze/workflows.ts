import { diagnoseProperty } from './diagnose-property.js'
import { crawlDiff, indexWatch } from './monitoring.js'
import { monthlyReport, reportNarrative } from './reports.js'
import { type SegmentImpactReport, segmentImpact } from './segment-impact.js'
import { updateCorrelation } from './traffic-anomaly.js'

export type WorkflowStep = {
  tool: string
  status: 'completed' | 'skipped'
  summary: string
}

export type WorkflowAction = {
  title: string
  action: string
  confidence: 'high' | 'medium' | 'low'
}

export type WorkflowReport<TOutput> = {
  workflow: string
  site: string
  generatedAt: string
  summary: string
  steps: WorkflowStep[]
  actions: WorkflowAction[]
  output: TOutput
}

export type PriorityQueueItem = {
  source:
    | 'decay'
    | 'striking-distance'
    | 'quick-win'
    | 'cannibalization'
    | 'diagnosis'
  title: string
  target: string
  score: number
  confidence: 'high' | 'medium' | 'low'
  action: string
  evidence: string
}

function workflowReport<TOutput>(input: {
  workflow: string
  site: string
  summary: string
  steps: WorkflowStep[]
  actions: WorkflowAction[]
  output: TOutput
}): WorkflowReport<TOutput> {
  return {
    workflow: input.workflow,
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: input.summary,
    steps: input.steps,
    actions: input.actions,
    output: input.output,
  }
}

function splitSegments(report: SegmentImpactReport): {
  winners: SegmentImpactReport['items']
  losers: SegmentImpactReport['items']
} {
  return {
    winners: report.items
      .filter((item) => item.clickDelta > 0)
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 10),
    losers: report.items
      .filter((item) => item.clickDelta < 0)
      .sort((a, b) => a.clickDelta - b.clickDelta)
      .slice(0, 10),
  }
}

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

export async function technicalWatchWorkflow(input: {
  site: string
  startUrl?: string
  urls?: string[]
  limit?: number
  refresh?: boolean
  js?: boolean | 'auto'
  languageCode?: string
}): Promise<
  WorkflowReport<{
    crawl?: Awaited<ReturnType<typeof crawlDiff>>
    index?: Awaited<ReturnType<typeof indexWatch>>
  }>
> {
  if (!input.startUrl && !input.urls?.length) {
    throw new Error('Pass startUrl, urls, or both for technical-watch.')
  }

  const [crawl, index] = await Promise.all([
    input.startUrl
      ? crawlDiff({
          site: input.site,
          startUrl: input.startUrl,
          limit: input.limit,
          refresh: input.refresh,
          js: input.js,
        })
      : undefined,
    input.urls?.length
      ? indexWatch({
          site: input.site,
          urls: input.urls,
          languageCode: input.languageCode,
        })
      : undefined,
  ])

  const alertCount =
    (crawl?.summary.newErrors ?? 0) +
    (crawl?.summary.indexabilityFlips ?? 0) +
    (index?.summary.alerts ?? 0)

  return workflowReport({
    workflow: 'technical-watch',
    site: input.site,
    summary: `${alertCount} material technical alert(s) found.`,
    steps: [
      {
        tool: 'seo_crawl_diff',
        status: crawl ? 'completed' : 'skipped',
        summary: crawl
          ? `Crawled ${crawl.summary.crawled} URLs; ${crawl.summary.changed} changed.`
          : 'No start URL passed.',
      },
      {
        tool: 'seo_index_watch',
        status: index ? 'completed' : 'skipped',
        summary: index
          ? `Inspected ${index.summary.inspected} URLs; ${index.summary.alerts} alerts.`
          : 'No inspection URLs passed.',
      },
    ],
    actions:
      alertCount > 0
        ? [
            {
              title: 'Triage technical alerts',
              action:
                'Prioritize new status errors, indexability flips, and URL Inspection alerts before content work.',
              confidence: 'high',
            },
          ]
        : [
            {
              title: 'No material technical alert',
              action:
                'Keep the saved crawl and index snapshots for the next run.',
              confidence: 'medium',
            },
          ],
    output: { crawl, index },
  })
}

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
