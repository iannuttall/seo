import { SeoError } from '../errors.js'
import type { GscRow } from '../types.js'
import { compareRetainedSegmentRows } from './segment-impact-rows.js'
import type {
  SegmentImpactReport,
  SegmentImpactSelection,
  SegmentRange,
} from './segment-impact-types.js'

function verdict(input: {
  status: SegmentImpactReport['dataStatus']
  matchedRows: number
  returnedRows: number
  unmatchedRows: number
}): string {
  if (input.status === 'empty') {
    return 'Search Console returned no retained segment rows for either window.'
  }
  if (!input.matchedRows) {
    return 'No segment was retained in both windows, so no movement delta was inferred.'
  }
  const suffix = input.unmatchedRows
    ? ` ${input.unmatchedRows} one-window rows were kept as unmatched evidence and not converted to zero.`
    : ''
  return `${input.returnedRows} of ${input.matchedRows} matched retained segments returned.${suffix}`
}

export function analyzeSegmentRows(input: {
  site: string
  dimension: SegmentImpactReport['dimension']
  before: SegmentRange
  after: SegmentRange
  beforeDays: number
  afterDays: number
  beforeRows: GscRow[]
  afterRows: GscRow[]
  limit: number
  unmatchedLimit: number
  maxRows: number
  generatedAt: string
  beforeCalls?: number
  afterCalls?: number
  beforeRowsFetched?: number
  afterRowsFetched?: number
}): SegmentImpactReport {
  if (
    !Number.isInteger(input.beforeDays) ||
    !Number.isInteger(input.afterDays) ||
    input.beforeDays < 1 ||
    input.afterDays < 1
  ) {
    throw new SeoError('INVALID_INPUT', 'Segment ranges must contain days.')
  }
  if (input.beforeDays !== input.afterDays) {
    throw new SeoError(
      'INVALID_INPUT',
      'Segment impact requires adjacent equal-length comparison windows.',
    )
  }
  const { before, after, matched, unmatched } =
    compareRetainedSegmentRows(input)

  const beforeRowsFetched = input.beforeRowsFetched ?? input.beforeRows.length
  const afterRowsFetched = input.afterRowsFetched ?? input.afterRows.length
  const beforeTruncated = beforeRowsFetched >= input.maxRows
  const afterTruncated = afterRowsFetched >= input.maxRows
  const unmatchedBeforeRows = unmatched.filter(
    (row) => row.retainedIn === 'before',
  ).length
  const unmatchedAfterRows = unmatched.length - unmatchedBeforeRows
  const selection: SegmentImpactSelection = {
    beforeSourceRows: input.beforeRows.length,
    afterSourceRows: input.afterRows.length,
    beforeInvalidRows: before.invalidRows,
    afterInvalidRows: after.invalidRows,
    beforeDuplicateRows: before.duplicateRows,
    afterDuplicateRows: after.duplicateRows,
    beforeConflictingRows: before.conflictingRows,
    afterConflictingRows: after.conflictingRows,
    matchedRows: matched.length,
    unmatchedBeforeRows,
    unmatchedAfterRows,
    returnedRows: Math.min(matched.length, input.limit),
    limitedRows: Math.max(0, matched.length - input.limit),
    returnedUnmatchedRows: Math.min(unmatched.length, input.unmatchedLimit),
    limitedUnmatchedRows: Math.max(0, unmatched.length - input.unmatchedLimit),
  }
  const hasPartialEvidence =
    beforeTruncated ||
    afterTruncated ||
    before.invalidRows > 0 ||
    after.invalidRows > 0 ||
    before.duplicateRows > 0 ||
    after.duplicateRows > 0 ||
    before.conflictingRows > 0 ||
    after.conflictingRows > 0 ||
    unmatched.length > 0 ||
    beforeRowsFetched === 0 ||
    afterRowsFetched === 0
  const dataStatus: SegmentImpactReport['dataStatus'] =
    beforeRowsFetched === 0 && afterRowsFetched === 0
      ? 'empty'
      : beforeRowsFetched === 0 ||
          afterRowsFetched === 0 ||
          matched.length === 0
        ? 'unavailable'
        : hasPartialEvidence
          ? 'partial'
          : 'complete'
  const warnings = [
    ...(beforeTruncated || afterTruncated
      ? [
          `At least one GSC window reached the ${input.maxRows.toLocaleString('en-GB')}-row safety cap. Results may be truncated.`,
        ]
      : []),
    ...(unmatched.length
      ? [
          `${unmatched.length} segments appeared in only one retained response. They are not treated as zero traffic or ranked as winners or losers.`,
        ]
      : []),
    ...(before.invalidRows || after.invalidRows
      ? [
          `${before.invalidRows} before and ${after.invalidRows} after rows had invalid dimensions or metrics and were excluded.`,
        ]
      : []),
    ...(before.duplicateRows || after.duplicateRows
      ? [
          `${before.duplicateRows} before and ${after.duplicateRows} after identical duplicate segment rows were deduplicated.`,
        ]
      : []),
    ...(before.conflictingRows || after.conflictingRows
      ? [
          `${before.conflictingRows} before and ${after.conflictingRows} after conflicting duplicate segment rows were excluded.`,
        ]
      : []),
  ]
  return {
    schemaVersion: 2,
    site: input.site,
    dimension: input.dimension,
    before: input.before,
    after: input.after,
    rangeDays: { before: input.beforeDays, after: input.afterDays },
    generatedAt: input.generatedAt,
    dataStatus,
    source: {
      provider: 'google-search-console',
      dimension: input.dimension,
      aggregationType: 'auto',
      searchType: 'web',
      dataState: 'final',
      before: {
        rowsFetched: beforeRowsFetched,
        calls: input.beforeCalls ?? 0,
        maxRows: input.maxRows,
        possiblyTruncated: beforeTruncated,
      },
      after: {
        rowsFetched: afterRowsFetched,
        calls: input.afterCalls ?? 0,
        maxRows: input.maxRows,
        possiblyTruncated: afterTruncated,
      },
      completeness:
        beforeTruncated || afterTruncated
          ? 'possibly-truncated'
          : 'retained-rows-only',
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
    filters: {
      limit: input.limit,
      unmatchedLimit: input.unmatchedLimit,
      maxRows: input.maxRows,
    },
    selection,
    summary: {
      matchedRows: matched.length,
      returnedRows: selection.returnedRows,
      unmatchedRows: unmatched.length,
      verdict: verdict({
        status: dataStatus,
        matchedRows: matched.length,
        returnedRows: selection.returnedRows,
        unmatchedRows: unmatched.length,
      }),
    },
    items: matched.slice(0, input.limit),
    unmatchedSegments: unmatched.slice(0, input.unmatchedLimit),
    warnings,
    caveats: [
      'Only segments retained in both GSC responses receive movement deltas. Search Console can omit anonymized and lower-volume rows, so one-window absence is not proof of zero traffic.',
      'Average position is impression-weighted provider data and is only compared when both retained rows have impressions.',
      'Search Console segment data is observational. Movement can guide investigation but does not establish the cause of a ranking, demand, or CTR change.',
    ],
  }
}
