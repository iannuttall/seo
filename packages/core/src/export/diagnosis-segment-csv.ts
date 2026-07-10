import type { DiagnosePropertyReport } from '../analyze/diagnose-property.js'
import type { CsvFile } from './csv.js'

const dimensions = ['page', 'query', 'device', 'country'] as const

const segmentHeaders = [
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
]

const unmatchedHeaders = [
  'rank',
  'dimension',
  'data_status',
  'key',
  'retained_in',
  'clicks',
  'impressions',
  'position',
  'reason',
]

export function diagnosisSegmentCsvFiles(
  report: DiagnosePropertyReport,
): CsvFile[] {
  return [
    {
      filename: 'segment-status.csv',
      headers: [
        'dimension',
        'data_status',
        'matched_rows',
        'unmatched_rows',
        'before_rows_fetched',
        'after_rows_fetched',
        'possibly_truncated',
        'verdict',
        'warnings',
      ],
      rows: dimensions.map((dimension) => {
        const segment = report.segments[dimension]
        return {
          dimension,
          data_status: segment.dataStatus,
          matched_rows: segment.summary.matchedRows,
          unmatched_rows: segment.summary.unmatchedRows,
          before_rows_fetched: segment.source.before.rowsFetched,
          after_rows_fetched: segment.source.after.rowsFetched,
          possibly_truncated:
            segment.source.before.possiblyTruncated ||
            segment.source.after.possiblyTruncated,
          verdict: segment.summary.verdict,
          warnings: segment.warnings.join('; '),
        }
      }),
    },
    ...dimensions.map(
      (dimension): CsvFile => ({
        filename: `segment-${dimension}.csv`,
        headers: segmentHeaders,
        rows: report.segments[dimension].items.map((item, index) => ({
          rank: index + 1,
          dimension,
          data_status: report.segments[dimension].dataStatus,
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
        })),
      }),
    ),
    ...dimensions.map(
      (dimension): CsvFile => ({
        filename: `segment-${dimension}-unmatched.csv`,
        headers: unmatchedHeaders,
        rows: report.segments[dimension].unmatchedSegments.map(
          (item, index) => ({
            rank: index + 1,
            dimension,
            data_status: report.segments[dimension].dataStatus,
            key: item.key,
            retained_in: item.retainedIn,
            clicks: item.clicks,
            impressions: item.impressions,
            position: item.position,
            reason: item.reason,
          }),
        ),
      }),
    ),
  ]
}
