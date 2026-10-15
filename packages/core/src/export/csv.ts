import type { DiagnosePropertyReport } from '../analyze/diagnose-property.js'
import type {
  PriorityQueueItem,
  WorkflowReport,
} from '../analyze/workflows/types.js'
import { diagnosisSegmentCsvFiles } from './diagnosis-segment-csv.js'

export type CsvValue = string | number | boolean | null | undefined
export type CsvRow = Record<string, CsvValue>
export type CsvFile = {
  filename: string
  headers?: string[]
  rows: CsvRow[]
}

const CSV_SCHEMAS: Record<string, string[]> = {
  'priorities.csv': ['rank', 'label', 'confidence', 'reason', 'action'],
  'anomalies.csv': [
    'metric',
    'direction',
    'significant',
    'baseline_start',
    'baseline_end',
    'comparison_start',
    'comparison_end',
    'baseline_mean',
    'comparison_mean',
    'baseline_total',
    'comparison_total',
    'percent_change',
    'z_score',
  ],
  'decay.csv': [
    'rank',
    'query',
    'url',
    'template',
    'diagnosis',
    'signals',
    'evidence_scope',
    'click_loss',
    'drop_pct',
    'previous_clicks',
    'current_clicks',
    'previous_position',
    'current_position',
    'action',
  ],
  'decay-clusters.csv': [
    'rank',
    'template',
    'diagnosis',
    'findings',
    'observed_click_decline',
    'previous_clicks',
    'average_drop_pct',
    'sample_queries',
    'sample_urls',
    'action',
  ],
  'cannibalisation.csv': [
    'rank',
    'query',
    'owner_url',
    'url_count',
    'hhi',
    'template',
    'urls',
    'clicks',
    'impressions',
    'action',
  ],
  'cannibalisation-suppressed.csv': [
    'rank',
    'query',
    'reason',
    'url_count',
    'template',
    'evidence',
  ],
  'striking-distance.csv': [
    'rank',
    'query',
    'url',
    'template',
    'clicks',
    'impressions',
    'ctr',
    'position',
    'opportunity_score',
    'coverage',
    'action',
  ],
  'quick-wins.csv': [
    'rank',
    'query',
    'url',
    'template',
    'position',
    'clicks',
    'impressions',
    'ctr',
    'target_ctr',
    'benchmark_source',
    'benchmark_sample_population',
    'benchmark_leave_out',
    'benchmark_confidence',
    'benchmark_peer_rows',
    'benchmark_qualified_impressions',
    'estimated_ctr_click_shortfall',
    'heuristic',
    'traffic_forecast',
    'coverage',
    'verification_status',
    'verification_error',
    'verification_signals',
    'confidence',
    'evidence',
    'action',
  ],
  'quick-win-groups.csv': [
    'rank',
    'label',
    'query',
    'template',
    'row_count',
    'url_count',
    'estimated_ctr_click_shortfall',
    'impressions',
    'sample_urls',
    'action',
  ],
  'priority-queue.csv': [
    'rank',
    'source',
    'category',
    'score',
    'impact',
    'impact_kind',
    'confidence',
    'findings',
    'title',
    'target',
    'template',
    'template_count',
    'google_analytics_sessions',
    'google_analytics_total_users',
    'evidence',
    'action',
  ],
  'priority-score-breakdown.csv': [
    'rank',
    'target',
    'source',
    'score',
    'impact_score',
    'source_weight',
    'confidence_weight',
    'effort_weight',
    'verification_weight',
    'template_weight',
    'analytics_weight',
  ],
  'priority-grouped-findings.csv': [
    'queue_rank',
    'finding_rank',
    'source',
    'category',
    'score',
    'impact',
    'impact_kind',
    'confidence',
    'title',
    'target',
    'template',
    'google_analytics_sessions',
    'evidence',
    'action',
  ],
  'workflow-steps.csv': ['rank', 'tool', 'status', 'summary'],
  'workflow-actions.csv': ['rank', 'title', 'confidence', 'action'],
  'warnings.csv': ['rank', 'warning'],
}

function schemaKey(filename: string): string {
  return filename.startsWith('diagnosis-')
    ? filename.slice('diagnosis-'.length)
    : filename
}

function withCsvSchemas(files: CsvFile[]): CsvFile[] {
  return files.map((file) => ({
    ...file,
    headers: file.headers ?? CSV_SCHEMAS[schemaKey(file.filename)],
  }))
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

export function renderCsv(rows: CsvRow[], headers?: string[]): string {
  const columnHeaders = headers ?? [
    ...new Set(rows.flatMap((row) => Object.keys(row))),
  ]
  const lines = [
    columnHeaders.map(csvCell).join(','),
    ...rows.map((row) =>
      columnHeaders.map((header) => csvCell(row[header])).join(','),
    ),
  ]
  return `${lines.join('\n')}\n`
}

export function quickWinsCsvRows(
  report: DiagnosePropertyReport['quickWins'],
): CsvRow[] {
  return report.items.map((item, index) => ({
    rank: index + 1,
    query: item.query,
    url: item.url,
    template: item.template.label,
    position: item.position,
    clicks: item.clicks,
    impressions: item.impressions,
    ctr: item.ctr,
    target_ctr: item.targetCtr,
    benchmark_source: item.benchmark.source,
    benchmark_sample_population: item.benchmark.samplePopulation,
    benchmark_leave_out: item.benchmark.leaveOut,
    benchmark_confidence: item.benchmark.confidence,
    benchmark_peer_rows: item.benchmark.peerRows,
    benchmark_qualified_impressions: item.benchmark.qualifiedPeerImpressions,
    estimated_ctr_click_shortfall: item.estimatedCtrClickShortfall,
    heuristic: item.priority.heuristic,
    traffic_forecast: item.priority.estimatedClickLift,
    coverage: item.contentVerification?.classification,
    verification_status: item.contentVerification?.status,
    verification_error: item.contentVerification?.error,
    verification_signals: item.contentVerification?.signals.join('; '),
    confidence: item.recommendation.confidence,
    evidence: item.recommendation.evidenceRef,
    action: item.recommendation.action,
  }))
}

export function diagnoseCsvFiles(report: DiagnosePropertyReport): CsvFile[] {
  return withCsvSchemas([
    {
      filename: 'priorities.csv',
      rows: report.priorities.map((item, index) => ({
        rank: index + 1,
        label: item.label,
        confidence: item.confidence,
        reason: item.reason,
        action: item.action,
      })),
    },
    {
      filename: 'anomalies.csv',
      rows: report.anomaly.anomalies.map((item) => ({
        metric: item.metric,
        direction: item.direction,
        significant: item.significant,
        baseline_start: item.baselineStart,
        baseline_end: item.baselineEnd,
        comparison_start: item.comparisonStart,
        comparison_end: item.comparisonEnd,
        baseline_mean: item.baselineMean,
        comparison_mean: item.comparisonMean,
        baseline_total: item.baselineTotal,
        comparison_total: item.comparisonTotal,
        percent_change: item.percentChange,
        z_score: item.zScore,
      })),
    },
    ...diagnosisSegmentCsvFiles(report),
    {
      filename: 'decay.csv',
      rows: report.decay.items.map((item, index) => ({
        rank: index + 1,
        query: item.query,
        url: item.url,
        template: item.template.label,
        diagnosis: item.diagnosis,
        signals: item.signals.join('; '),
        evidence_scope: item.evidenceScope,
        click_loss: item.clickLoss,
        drop_pct: item.dropPct,
        previous_clicks: item.previous.clicks,
        current_clicks: item.current.clicks,
        previous_position: item.previous.position,
        current_position: item.current.position,
        action: item.recommendation.action,
      })),
    },
    {
      filename: 'decay-clusters.csv',
      rows: report.decay.groups.map((item, index) => ({
        rank: index + 1,
        template: item.template.label,
        diagnosis: item.diagnosis,
        findings: item.count,
        observed_click_decline: item.totalClickLoss,
        previous_clicks: item.totalPreviousClicks,
        average_drop_pct: item.averageDropPct,
        sample_queries: item.sampleQueries.join('; '),
        sample_urls: item.sampleUrls.join('; '),
        action: item.recommendation,
      })),
    },
    {
      filename: 'cannibalisation.csv',
      rows: report.cannibalization.items.map((item, index) => ({
        rank: index + 1,
        query: item.query,
        suggested_owner_url: item.suggestedOwnerUrl,
        url_count: item.pages.length,
        hhi: item.hhi,
        property_impressions: item.propertyImpressions,
        page_exposure_impressions: item.pageExposureImpressions,
        observed_page_exposure_ratio: item.observedPageExposureRatio,
        template: item.template?.label,
        urls: item.pages.map((page) => page.url).join('; '),
        clicks: item.pages.reduce((sum, page) => sum + page.clicks, 0),
        review_context: item.reviewContext.join('; '),
        action: item.recommendation.action,
      })),
    },
    {
      filename: 'cannibalisation-suppressed.csv',
      rows: report.cannibalization.suppressed.map((item, index) => ({
        rank: index + 1,
        query: item.query,
        reason: item.reason,
        url_count: item.urlCount,
        template: item.template?.label,
        evidence: item.evidenceRef,
      })),
    },
    {
      filename: 'striking-distance.csv',
      rows: report.strikingDistance.items.map((item, index) => ({
        rank: index + 1,
        query: item.query,
        url: item.url,
        template: item.template.label,
        clicks: item.clicks,
        impressions: item.impressions,
        ctr: item.ctr,
        position: item.position,
        priority_method: item.priority.method,
        priority_score: item.priority.score,
        estimated_click_lift: item.priority.estimatedClickLift,
        coverage: item.contentVerification?.classification,
        action_type: item.recommendation.type,
        confidence: item.recommendation.confidence,
        evidence: item.recommendation.evidence,
        action: item.recommendation.action,
      })),
    },
    {
      filename: 'quick-wins.csv',
      rows: quickWinsCsvRows(report.quickWins),
    },
    {
      filename: 'quick-win-groups.csv',
      rows: report.quickWins.groups.map((item, index) => ({
        rank: index + 1,
        label: item.label,
        query: item.query,
        template: item.template.label,
        row_count: item.rowCount,
        url_count: item.urlCount,
        estimated_ctr_click_shortfall: item.totalEstimatedCtrClickShortfall,
        impressions: item.totalImpressions,
        sample_urls: item.sampleUrls.join('; '),
        action: item.recommendation,
      })),
    },
  ])
}

function prefixCsvFiles(prefix: string, files: CsvFile[]): CsvFile[] {
  return files.map((file) => ({
    ...file,
    filename: `${prefix}-${file.filename}`,
  }))
}

export function refreshPrioritiesCsvFiles(
  report: WorkflowReport<{
    queue: PriorityQueueItem[]
    warnings: string[]
    diagnosis: DiagnosePropertyReport
  }>,
): CsvFile[] {
  return withCsvSchemas([
    {
      filename: 'priority-queue.csv',
      rows: report.output.queue.map((item, index) => ({
        rank: index + 1,
        source: item.source,
        category: item.category,
        score: item.score,
        impact: item.impact,
        impact_kind: item.impactKind,
        confidence: item.confidence,
        findings: item.grouped?.count ?? 1,
        title: item.title,
        target: item.target,
        template: item.template?.label,
        template_count: item.template?.count,
        google_analytics_sessions: item.analytics?.sessions,
        google_analytics_total_users: item.analytics?.totalUsers,
        evidence: item.evidence,
        action: item.action,
      })),
    },
    {
      filename: 'priority-score-breakdown.csv',
      rows: report.output.queue.map((item, index) => ({
        rank: index + 1,
        target: item.target,
        source: item.source,
        score: item.scoreBreakdown.final,
        impact_score: item.scoreBreakdown.impact,
        source_weight: item.scoreBreakdown.source,
        confidence_weight: item.scoreBreakdown.confidence,
        effort_weight: item.scoreBreakdown.effort,
        verification_weight: item.scoreBreakdown.verification,
        template_weight: item.scoreBreakdown.template,
        analytics_weight: item.scoreBreakdown.analytics,
      })),
    },
    {
      filename: 'priority-grouped-findings.csv',
      rows: report.output.queue.flatMap((item, rank) =>
        (item.grouped?.findings ?? []).map((finding, index) => ({
          queue_rank: rank + 1,
          finding_rank: index + 1,
          source: finding.source,
          category: finding.category,
          score: finding.score,
          impact: finding.impact,
          impact_kind: finding.impactKind,
          confidence: finding.confidence,
          title: finding.title,
          target: finding.target,
          template: finding.template?.label,
          google_analytics_sessions: finding.analytics?.sessions,
          evidence: finding.evidence,
          action: finding.action,
        })),
      ),
    },
    {
      filename: 'workflow-steps.csv',
      rows: report.steps.map((step, index) => ({
        rank: index + 1,
        tool: step.tool,
        status: step.status,
        summary: step.summary,
      })),
    },
    {
      filename: 'workflow-actions.csv',
      rows: report.actions.map((action, index) => ({
        rank: index + 1,
        title: action.title,
        confidence: action.confidence,
        action: action.action,
      })),
    },
    {
      filename: 'warnings.csv',
      rows: report.output.warnings.map((warning, index) => ({
        rank: index + 1,
        warning,
      })),
    },
    ...prefixCsvFiles('diagnosis', diagnoseCsvFiles(report.output.diagnosis)),
  ])
}
