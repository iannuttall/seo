import type { WorkflowReport } from '../analyze/workflows/types.js'
import type { CsvFile, CsvRow } from './csv.js'

type PostmortemCsvReport = WorkflowReport<{
  update: {
    attribution: string
    confidence: string
    classification: string
    overlappingUpdates: unknown[]
    evidence: string[]
    confounders: Array<{
      source: string
      title: string
      date?: string
      scope?: string
      target?: string
      description?: string
    }>
  }
  insights: Array<{
    dimension: 'page' | 'query' | 'device' | 'country'
    dataStatus: SegmentStatus
    unmatchedRows: number
    summary: string
    winner?: SegmentItem
    loser?: SegmentItem
  }>
  templateMovement: Array<{
    signature: string
    direction: string
    confidence: string
    urlCount: number
    clickDelta: number
    impressionDelta: number
    movementShare: number
    commonTerms: string[]
    sampleUrls: string[]
    summary: string
  }>
  segments: Record<
    'page' | 'query' | 'device' | 'country',
    {
      winners: SegmentItem[]
      losers: SegmentItem[]
      dataStatus: SegmentStatus
      summary: {
        matchedRows: number
        returnedRows: number
        unmatchedRows: number
        verdict: string
      }
      unmatchedSegments: UnmatchedSegment[]
      warnings: string[]
    }
  >
}>

type SegmentStatus = 'unavailable' | 'empty' | 'partial' | 'complete'

type UnmatchedSegment = {
  key: string
  retainedIn: 'before' | 'after'
  clicks: number
  impressions: number
  position: number | null
  reason: 'not-retained-in-other-window'
}

type SegmentItem = {
  key: string
  evidenceScope: 'matched-retained-segment'
  beforeClicks: number
  afterClicks: number
  clickDelta: number
  beforeImpressions: number
  afterImpressions: number
  impressionDelta: number
  beforePosition: number | null
  afterPosition: number | null
  positionDelta: number | null
}

const HEADERS = {
  summary: [
    'workflow',
    'site',
    'generated_at',
    'summary',
    'attribution',
    'confidence',
    'classification',
    'updates_matched',
    'known_confounders',
    'page_segment_status',
    'page_segment_warnings',
    'query_segment_status',
    'query_segment_warnings',
    'device_segment_status',
    'device_segment_warnings',
    'country_segment_status',
    'country_segment_warnings',
  ],
  steps: ['rank', 'tool', 'status', 'summary'],
  actions: ['rank', 'title', 'confidence', 'action'],
  findings: [
    'dimension',
    'data_status',
    'unmatched_rows',
    'summary',
    'winner_key',
    'winner_click_delta',
    'winner_impression_delta',
    'winner_position_delta',
    'loser_key',
    'loser_click_delta',
    'loser_impression_delta',
    'loser_position_delta',
  ],
  templates: [
    'rank',
    'direction',
    'template',
    'confidence',
    'url_count',
    'click_delta',
    'impression_delta',
    'movement_share',
    'common_terms',
    'sample_urls',
    'summary',
  ],
  evidence: ['rank', 'evidence'],
  confounders: [
    'rank',
    'source',
    'title',
    'date',
    'scope',
    'target',
    'description',
  ],
  segment: [
    'rank',
    'dimension',
    'data_status',
    'evidence_scope',
    'key',
    'before_clicks',
    'after_clicks',
    'click_delta',
    'before_impressions',
    'after_impressions',
    'impression_delta',
    'before_position',
    'after_position',
    'position_delta',
  ],
  unmatchedSegment: [
    'rank',
    'dimension',
    'data_status',
    'key',
    'retained_in',
    'clicks',
    'impressions',
    'position',
    'reason',
  ],
} as const

function postmortemSegmentRows(
  report: PostmortemCsvReport,
  dimension: 'page' | 'query' | 'device' | 'country',
): CsvRow[] {
  return [
    ...report.output.segments[dimension].winners,
    ...report.output.segments[dimension].losers,
  ].map((item, index) => ({
    rank: index + 1,
    dimension,
    data_status: report.output.segments[dimension].dataStatus,
    evidence_scope: item.evidenceScope,
    key: item.key,
    before_clicks: item.beforeClicks,
    after_clicks: item.afterClicks,
    click_delta: item.clickDelta,
    before_impressions: item.beforeImpressions,
    after_impressions: item.afterImpressions,
    impression_delta: item.impressionDelta,
    before_position: item.beforePosition,
    after_position: item.afterPosition,
    position_delta: item.positionDelta,
  }))
}

function postmortemUnmatchedSegmentRows(
  report: PostmortemCsvReport,
  dimension: 'page' | 'query' | 'device' | 'country',
): CsvRow[] {
  return report.output.segments[dimension].unmatchedSegments.map(
    (item, index) => ({
      rank: index + 1,
      dimension,
      data_status: report.output.segments[dimension].dataStatus,
      key: item.key,
      retained_in: item.retainedIn,
      clicks: item.clicks,
      impressions: item.impressions,
      position: item.position,
      reason: item.reason,
    }),
  )
}

export function updatePostmortemCsvFiles(
  report: PostmortemCsvReport,
): CsvFile[] {
  return [
    {
      filename: 'postmortem-summary.csv',
      headers: [...HEADERS.summary],
      rows: [
        {
          workflow: report.workflow,
          site: report.site,
          generated_at: report.generatedAt,
          summary: report.summary,
          attribution: report.output.update.attribution,
          confidence: report.output.update.confidence,
          classification: report.output.update.classification,
          updates_matched: report.output.update.overlappingUpdates.length,
          known_confounders: report.output.update.confounders.length,
          page_segment_status: report.output.segments.page.dataStatus,
          page_segment_warnings:
            report.output.segments.page.warnings.join('; '),
          query_segment_status: report.output.segments.query.dataStatus,
          query_segment_warnings:
            report.output.segments.query.warnings.join('; '),
          device_segment_status: report.output.segments.device.dataStatus,
          device_segment_warnings:
            report.output.segments.device.warnings.join('; '),
          country_segment_status: report.output.segments.country.dataStatus,
          country_segment_warnings:
            report.output.segments.country.warnings.join('; '),
        },
      ],
    },
    {
      filename: 'workflow-steps.csv',
      headers: [...HEADERS.steps],
      rows: report.steps.map((step, index) => ({
        rank: index + 1,
        tool: step.tool,
        status: step.status,
        summary: step.summary,
      })),
    },
    {
      filename: 'workflow-actions.csv',
      headers: [...HEADERS.actions],
      rows: report.actions.map((action, index) => ({
        rank: index + 1,
        title: action.title,
        confidence: action.confidence,
        action: action.action,
      })),
    },
    {
      filename: 'postmortem-findings.csv',
      headers: [...HEADERS.findings],
      rows: report.output.insights.map((item) => ({
        dimension: item.dimension,
        data_status: item.dataStatus,
        unmatched_rows: item.unmatchedRows,
        summary: item.summary,
        winner_key: item.winner?.key,
        winner_click_delta: item.winner?.clickDelta,
        winner_impression_delta: item.winner?.impressionDelta,
        winner_position_delta: item.winner?.positionDelta,
        loser_key: item.loser?.key,
        loser_click_delta: item.loser?.clickDelta,
        loser_impression_delta: item.loser?.impressionDelta,
        loser_position_delta: item.loser?.positionDelta,
      })),
    },
    {
      filename: 'postmortem-template-movement.csv',
      headers: [...HEADERS.templates],
      rows: report.output.templateMovement.map((item, index) => ({
        rank: index + 1,
        direction: item.direction,
        template: item.signature,
        confidence: item.confidence,
        url_count: item.urlCount,
        click_delta: item.clickDelta,
        impression_delta: item.impressionDelta,
        movement_share: item.movementShare,
        common_terms: item.commonTerms.join('; '),
        sample_urls: item.sampleUrls.join('; '),
        summary: item.summary,
      })),
    },
    {
      filename: 'postmortem-update-evidence.csv',
      headers: [...HEADERS.evidence],
      rows: report.output.update.evidence.map((evidence, index) => ({
        rank: index + 1,
        evidence,
      })),
    },
    {
      filename: 'postmortem-confounders.csv',
      headers: [...HEADERS.confounders],
      rows: report.output.update.confounders.map((item, index) => ({
        rank: index + 1,
        source: item.source,
        title: item.title,
        date: item.date,
        scope: item.scope,
        target: item.target,
        description: item.description,
      })),
    },
    ...(['page', 'query', 'device', 'country'] as const).map((dimension) => ({
      filename: `postmortem-segment-${dimension}.csv`,
      headers: [...HEADERS.segment],
      rows: postmortemSegmentRows(report, dimension),
    })),
    ...(['page', 'query', 'device', 'country'] as const).map((dimension) => ({
      filename: `postmortem-segment-${dimension}-unmatched.csv`,
      headers: [...HEADERS.unmatchedSegment],
      rows: postmortemUnmatchedSegmentRows(report, dimension),
    })),
  ]
}
