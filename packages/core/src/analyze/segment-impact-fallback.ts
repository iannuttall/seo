import {
  segmentComparisonRange,
  segmentRangeDays,
} from './segment-impact-input.js'
import type {
  SegmentDimension,
  SegmentImpactReport,
  SegmentRange,
} from './segment-impact-types.js'

export function unavailableSegmentImpactReport(input: {
  site: string
  dimension: SegmentDimension
  after: SegmentRange
  reason: string
  generatedAt?: string
}): SegmentImpactReport {
  const days = segmentRangeDays(input.after)
  const before = segmentComparisonRange(input.after, days)
  return {
    schemaVersion: 2,
    site: input.site,
    dimension: input.dimension,
    before,
    after: input.after,
    rangeDays: { before: days, after: days },
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dataStatus: 'unavailable',
    source: {
      provider: 'google-search-console',
      dimension: input.dimension,
      aggregationType: 'auto',
      searchType: 'web',
      dataState: 'final',
      before: {
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      after: {
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      completeness: 'unavailable',
    },
    methodology: {
      id: 'gsc_matched_retained_segment_impact',
      version: 2,
      missingRowsTreatedAsZero: false,
      equalLengthAdjacentWindows: true,
      clickDeltaBasis: 'after-minus-before',
      positionDeltaDefinition: 'after-minus-before-positive-is-worse',
      causeLanguage: 'signals-not-attribution',
    },
    filters: { limit: 0, unmatchedLimit: 0, maxRows: 100_000 },
    selection: {
      beforeSourceRows: 0,
      afterSourceRows: 0,
      beforeInvalidRows: 0,
      afterInvalidRows: 0,
      beforeDuplicateRows: 0,
      afterDuplicateRows: 0,
      beforeConflictingRows: 0,
      afterConflictingRows: 0,
      matchedRows: 0,
      unmatchedBeforeRows: 0,
      unmatchedAfterRows: 0,
      returnedRows: 0,
      limitedRows: 0,
      returnedUnmatchedRows: 0,
      limitedUnmatchedRows: 0,
    },
    summary: {
      matchedRows: 0,
      returnedRows: 0,
      unmatchedRows: 0,
      verdict: 'Segment movement could not be compared for this run.',
    },
    items: [],
    unmatchedSegments: [],
    warnings: [input.reason],
    caveats: [
      'No segment movement conclusion was produced because the provider evidence was unavailable.',
    ],
  }
}
