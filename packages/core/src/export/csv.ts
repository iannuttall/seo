import type { DiagnosePropertyReport } from '../analyze/diagnose-property.js'
import type { PseoAuditReport } from '../analyze/pseo/audit.js'

export type CsvValue = string | number | boolean | null | undefined
export type CsvRow = Record<string, CsvValue>
export type CsvFile = {
  filename: string
  rows: CsvRow[]
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

export function renderCsv(rows: CsvRow[]): string {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(','),
    ),
  ]
  return `${lines.join('\n')}\n`
}

export function diagnoseCsvFiles(report: DiagnosePropertyReport): CsvFile[] {
  return [
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
        lost_clicks: item.totalClickLoss,
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
        owner_url: item.ownerUrl,
        url_count: item.pages.length,
        hhi: item.hhi,
        template: item.template?.label,
        urls: item.pages.map((page) => page.url).join('; '),
        clicks: item.pages.reduce((sum, page) => sum + page.clicks, 0),
        impressions: item.pages.reduce(
          (sum, page) => sum + page.impressions,
          0,
        ),
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
        opportunity_score: item.opportunityScore,
        coverage: item.contentVerification?.classification,
        action: item.action,
      })),
    },
    {
      filename: 'quick-wins.csv',
      rows: report.quickWins.items.map((item, index) => ({
        rank: index + 1,
        query: item.query,
        url: item.url,
        template: item.template.label,
        position: item.position,
        impressions: item.impressions,
        ctr: item.ctr,
        estimated_click_lift: item.estimatedClickLift,
        coverage: item.contentVerification?.classification,
        action: item.recommendation.action,
      })),
    },
    {
      filename: 'quick-win-groups.csv',
      rows: report.quickWins.groups.map((item, index) => ({
        rank: index + 1,
        label: item.label,
        query: item.query,
        template: item.template.label,
        count: item.count,
        estimated_click_lift: item.totalEstimatedClickLift,
        impressions: item.totalImpressions,
        sample_urls: item.sampleUrls.join('; '),
        action: item.recommendation,
      })),
    },
  ]
}

export function pseoCsvFiles(report: PseoAuditReport): CsvFile[] {
  return [
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
        crawled_urls: item.crawl.samples.length,
        crawl_blocked_or_failed: item.crawl.blockedOrFailed,
        inspected_urls: item.inspection.samples.length,
        not_indexed: item.inspection.notIndexed,
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
          label: pattern.label,
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
  ]
}
