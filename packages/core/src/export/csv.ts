import type { DiagnosePropertyReport } from '../analyze/diagnose-property.js'
import type { PseoAuditReport } from '../analyze/pseo/audit.js'
import type { ReportNarrative } from '../analyze/reports/types.js'
import type {
  PriorityQueueItem,
  WorkflowReport,
} from '../analyze/workflows/types.js'

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
  'segment-page.csv': segmentHeaders(),
  'segment-query.csv': segmentHeaders(),
  'segment-device.csv': segmentHeaders(),
  'segment-country.csv': segmentHeaders(),
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
  'report-summary.csv': [
    'site',
    'generated_at',
    'period_start',
    'period_end',
    'period_days',
    'headline',
  ],
  'report-sections.csv': ['section', 'rank', 'bullet'],
  'report-caveats.csv': ['rank', 'caveat'],
  'report-priorities.csv': ['rank', 'title', 'confidence', 'action'],
  'change-measurements.csv': [
    'change_id',
    'title',
    'scope',
    'target',
    'changed_at',
    'verdict',
    'confidence',
    'before_start',
    'before_end',
    'after_start',
    'after_end',
    'before_clicks',
    'after_clicks',
    'click_delta',
    'click_pct',
    'impression_delta',
    'ctr_delta',
    'position_delta',
    'note',
  ],
  'monitoring-crawls.csv': [
    'id',
    'site',
    'start_url',
    'created_at',
    'limit',
    'url_count',
    'status_errors',
    'non_indexable',
    'recommendations',
    'high_priority_recommendations',
    'top_recommendation_url',
    'top_recommendation_severity',
    'top_recommendation_title',
    'top_recommendation_action',
  ],
  'monitoring-index-watch.csv': [
    'inspected_urls',
    'latest_inspected_at',
    'non_pass',
    'blocked',
    'earliest_inspected_at',
    'current_issues',
    'failed',
  ],
  'monitoring-link-recover.csv': [
    'id',
    'site',
    'created_at',
    'start_date',
    'end_date',
    'days',
    'checked',
    'recoverable',
    'high',
    'medium',
    'low',
    'clicks_at_risk',
    'impressions_at_risk',
    'top_issue',
    'top_url',
    'top_action',
    'repeated_urls',
    'repeated_top_url',
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
    'ga4_sessions',
    'ga4_total_users',
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
    'ga4_sessions',
    'evidence',
    'action',
  ],
  'workflow-steps.csv': ['rank', 'tool', 'status', 'summary'],
  'workflow-actions.csv': ['rank', 'title', 'confidence', 'action'],
  'warnings.csv': ['rank', 'warning'],
  'templates.csv': [
    'rank',
    'template',
    'verdict',
    'confidence',
    'urls',
    'clicks',
    'impressions',
    'ctr',
    'position',
    'entity_fit_impression_share',
    'discovered_urls',
    'gsc_visible_urls',
    'untested_urls',
    'crawl_attempts',
    'crawled_urls',
    'crawl_blocked_or_failed',
    'inspection_attempts',
    'inspected_urls',
    'not_indexed',
    'inspection_unknown',
    'evidence',
    'action',
  ],
  'pseo-caveats.csv': ['rank', 'caveat'],
  'template-queries.csv': [
    'template',
    'rank',
    'query',
    'clicks',
    'impressions',
    'position',
  ],
  'demand-patterns.csv': [
    'template',
    'rank',
    'label',
    'impressions',
    'clicks',
    'sample_queries',
  ],
  'sample-coverage.csv': [
    'template',
    'url',
    'query',
    'classification',
    'title_coverage',
    'h1_coverage',
    'body_coverage',
    'missing_terms',
  ],
  'weak-entity-fit.csv': ['template', 'query', 'url', 'path_terms'],
  'crawl-samples.csv': [
    'template',
    'url',
    'status',
    'final_url',
    'title',
    'meta_description',
    'h1',
    'word_count',
    'technical_status',
    'canonical',
    'meta_robots',
    'x_robots_tag',
    'warning',
    'blocked',
    'rendered',
    'cache',
  ],
  'inspection-samples.csv': [
    'template',
    'url',
    'verdict',
    'index_status',
    'coverage_state',
    'indexing_state',
    'page_fetch_state',
    'google_canonical',
    'user_canonical',
    'last_crawl_time',
    'warning',
  ],
}

function segmentHeaders(): string[] {
  return [
    'rank',
    'dimension',
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
  ]
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

function readablePseoPatternLabel(label: string): string {
  if (label.startsWith('theme: ')) {
    return `${label.slice('theme: '.length)}-related`
  }
  if (label === 'general') return 'broad'
  return label
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
    ...(['page', 'query', 'device', 'country'] as const).map((dimension) => ({
      filename: `segment-${dimension}.csv`,
      rows: report.segments[dimension].items.map((item, index) => ({
        rank: index + 1,
        dimension,
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
      })),
    })),
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

export function narrativeCsvFiles(report: ReportNarrative): CsvFile[] {
  const recovery = report.monitoring.linkRecover
  return withCsvSchemas([
    {
      filename: 'report-summary.csv',
      rows: [
        {
          site: report.site,
          generated_at: report.generatedAt,
          period_start: report.period.startDate,
          period_end: report.period.endDate,
          period_days: report.periodDays,
          headline: report.headline,
        },
      ],
    },
    {
      filename: 'report-sections.csv',
      rows: report.sections.flatMap((section) =>
        section.bullets.map((bullet, index) => ({
          section: section.title,
          rank: index + 1,
          bullet,
        })),
      ),
    },
    {
      filename: 'report-caveats.csv',
      rows: report.caveats.map((caveat, index) => ({
        rank: index + 1,
        caveat,
      })),
    },
    {
      filename: 'report-priorities.csv',
      rows: report.priorities.map((priority, index) => ({
        rank: index + 1,
        title: priority.title,
        confidence: priority.confidence,
        action: priority.action,
      })),
    },
    {
      filename: 'change-measurements.csv',
      rows: report.changeMeasurements.map((measurement) => ({
        change_id: measurement.change.id,
        title: measurement.change.title,
        scope: measurement.change.scope,
        target: measurement.change.target,
        changed_at: measurement.change.changedAt,
        verdict: measurement.verdict,
        confidence: measurement.confidence,
        before_start: measurement.before.startDate,
        before_end: measurement.before.endDate,
        after_start: measurement.after.startDate,
        after_end: measurement.after.endDate,
        before_clicks: measurement.before.metrics.clicks,
        after_clicks: measurement.after.metrics.clicks,
        click_delta: measurement.delta.clicks,
        click_pct: measurement.delta.clickPct,
        impression_delta: measurement.delta.impressions,
        ctr_delta: measurement.delta.ctr,
        position_delta: measurement.delta.position,
        note: measurement.note,
      })),
    },
    {
      filename: 'monitoring-crawls.csv',
      rows: report.monitoring.crawlRuns.map((crawl) => ({
        id: crawl.id,
        site: crawl.site,
        start_url: crawl.startUrl,
        created_at: crawl.createdAt,
        limit: crawl.limit,
        url_count: crawl.urlCount,
        status_errors: crawl.statusErrors,
        non_indexable: crawl.nonIndexable,
        recommendations: crawl.recommendations,
        high_priority_recommendations: crawl.highPriorityRecommendations,
        top_recommendation_url: crawl.topRecommendation?.url,
        top_recommendation_severity: crawl.topRecommendation?.severity,
        top_recommendation_title: crawl.topRecommendation?.title,
        top_recommendation_action: crawl.topRecommendation?.action,
      })),
    },
    {
      filename: 'monitoring-index-watch.csv',
      rows: [
        {
          inspected_urls: report.monitoring.indexWatch.inspectedUrls,
          latest_inspected_at: report.monitoring.indexWatch.latestInspectedAt,
          non_pass: report.monitoring.indexWatch.nonPass,
          blocked: report.monitoring.indexWatch.blocked,
          earliest_inspected_at:
            report.monitoring.indexWatch.earliestInspectedAt,
          current_issues: report.monitoring.indexWatch.currentIssues,
          failed: report.monitoring.indexWatch.failed,
        },
      ],
    },
    {
      filename: 'monitoring-link-recover.csv',
      rows: recovery
        ? [
            {
              id: recovery.id,
              site: recovery.site,
              created_at: recovery.createdAt,
              start_date: recovery.range.startDate,
              end_date: recovery.range.endDate,
              days: recovery.range.days,
              checked: recovery.checked,
              recoverable: recovery.recoverable,
              high: recovery.high,
              medium: recovery.medium,
              low: recovery.low,
              clicks_at_risk: recovery.clicksAtRisk,
              impressions_at_risk: recovery.impressionsAtRisk,
              top_issue: recovery.topIssue,
              top_url: recovery.topUrl,
              top_action: recovery.topAction,
              repeated_urls: recovery.repeatedUrls,
              repeated_top_url: recovery.repeatedTopUrl,
            },
          ]
        : [],
    },
    ...prefixCsvFiles('diagnosis', diagnoseCsvFiles(report.diagnosis)),
  ])
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
        ga4_sessions: item.analytics?.sessions,
        ga4_total_users: item.analytics?.totalUsers,
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
          ga4_sessions: finding.analytics?.sessions,
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

export function pseoCsvFiles(report: PseoAuditReport): CsvFile[] {
  return withCsvSchemas([
    {
      filename: 'pseo-caveats.csv',
      rows: report.caveats.map((caveat, index) => ({
        rank: index + 1,
        caveat,
      })),
    },
    {
      filename: 'templates.csv',
      rows: report.templates.map((item, index) => ({
        rank: index + 1,
        template: item.signature,
        verdict: item.verdict,
        confidence: item.confidence,
        urls: item.urlCount,
        clicks: item.metrics.clicks,
        impressions: item.metrics.impressions,
        ctr: item.metrics.ctr,
        position: item.metrics.position,
        entity_fit_impression_share: item.metrics.entityFit.impressionShare,
        discovered_urls: item.population.discoveredUrls,
        gsc_visible_urls: item.population.gscVisibleUrls,
        untested_urls: item.population.untestedUrls,
        crawl_attempts: item.crawl.attempted,
        crawled_urls: item.crawl.usable,
        crawl_blocked_or_failed: item.crawl.blockedOrFailed,
        inspection_attempts: item.inspection.attempted,
        inspected_urls: item.inspection.succeeded,
        not_indexed: item.inspection.notIndexed,
        inspection_unknown: item.inspection.unknown,
        evidence: item.evidence.join('; '),
        action: item.recommendation,
      })),
    },
    {
      filename: 'template-queries.csv',
      rows: report.templates.flatMap((template) =>
        template.metrics.topQueries.map((query, index) => ({
          template: template.signature,
          rank: index + 1,
          query: query.query,
          clicks: query.clicks,
          impressions: query.impressions,
          position: query.position,
        })),
      ),
    },
    {
      filename: 'demand-patterns.csv',
      rows: report.templates.flatMap((template) =>
        template.metrics.queryPatterns.map((pattern, index) => ({
          template: template.signature,
          rank: index + 1,
          label: readablePseoPatternLabel(pattern.label),
          impressions: pattern.impressions,
          clicks: pattern.clicks,
          sample_queries: pattern.examples.join('; '),
        })),
      ),
    },
    {
      filename: 'sample-coverage.csv',
      rows: report.templates.flatMap((template) =>
        template.crawl.samples.flatMap((sample) =>
          sample.queryCoverage
            ? [
                {
                  template: template.signature,
                  url: sample.url,
                  query: sample.queryCoverage.query,
                  classification: sample.queryCoverage.classification,
                  title_coverage: sample.queryCoverage.titleCoverage,
                  h1_coverage: sample.queryCoverage.h1Coverage,
                  body_coverage: sample.queryCoverage.bodyCoverage,
                  missing_terms: sample.queryCoverage.missingTerms.join('; '),
                },
              ]
            : [],
        ),
      ),
    },
    {
      filename: 'weak-entity-fit.csv',
      rows: report.templates.flatMap((template) =>
        template.metrics.entityFit.weakExamples.map((example) => ({
          template: template.signature,
          query: example.query,
          url: example.url,
          path_terms: example.pathTerms.join('; '),
        })),
      ),
    },
    {
      filename: 'crawl-samples.csv',
      rows: report.templates.flatMap((template) =>
        template.crawl.samples.map((sample) => ({
          template: template.signature,
          url: sample.url,
          status: sample.status,
          final_url: sample.finalUrl,
          title: sample.title,
          meta_description: sample.metaDescription,
          h1: sample.h1,
          word_count: sample.wordCount,
          technical_status: sample.technicalStatus,
          canonical: sample.canonical,
          meta_robots: sample.metaRobots,
          x_robots_tag: sample.xRobotsTag,
          warning: sample.warning,
          blocked: sample.fetchDiagnostics?.blocked,
          rendered: sample.fetchDiagnostics?.rendered,
          cache: sample.fetchDiagnostics?.cache,
        })),
      ),
    },
    {
      filename: 'inspection-samples.csv',
      rows: report.templates.flatMap((template) =>
        template.inspection.samples.map((sample) => ({
          template: template.signature,
          url: sample.url,
          verdict: sample.verdict,
          index_status: sample.indexStatus,
          coverage_state: sample.coverageState,
          indexing_state: sample.indexingState,
          page_fetch_state: sample.pageFetchState,
          google_canonical: sample.googleCanonical,
          user_canonical: sample.userCanonical,
          last_crawl_time: sample.lastCrawlTime,
          warning: sample.warning,
        })),
      ),
    },
  ])
}
