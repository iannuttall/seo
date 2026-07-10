export type SegmentDimension = 'page' | 'query' | 'country' | 'device'

export type SegmentRange = { startDate: string; endDate: string }

export type SegmentPeriodEvidence = {
  rowsFetched: number
  calls: number
  maxRows: number
  possiblyTruncated: boolean
}

export type SegmentImpactItem = {
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

export type UnmatchedSegment = {
  key: string
  retainedIn: 'before' | 'after'
  clicks: number
  impressions: number
  position: number | null
  reason: 'not-retained-in-other-window'
}

export type SegmentImpactSelection = {
  beforeSourceRows: number
  afterSourceRows: number
  beforeInvalidRows: number
  afterInvalidRows: number
  beforeDuplicateRows: number
  afterDuplicateRows: number
  beforeConflictingRows: number
  afterConflictingRows: number
  matchedRows: number
  unmatchedBeforeRows: number
  unmatchedAfterRows: number
  returnedRows: number
  limitedRows: number
  returnedUnmatchedRows: number
  limitedUnmatchedRows: number
}

export type SegmentImpactReport = {
  schemaVersion: 2
  site: string
  dimension: SegmentDimension
  before: SegmentRange
  after: SegmentRange
  rangeDays: { before: number; after: number }
  generatedAt: string
  dataStatus: 'unavailable' | 'empty' | 'partial' | 'complete'
  source: {
    provider: 'google-search-console'
    dimension: SegmentDimension
    aggregationType: 'auto'
    searchType: 'web'
    dataState: 'final'
    before: SegmentPeriodEvidence
    after: SegmentPeriodEvidence
    completeness: 'unavailable' | 'retained-rows-only' | 'possibly-truncated'
  }
  methodology: {
    id: 'gsc_matched_retained_segment_impact'
    version: 2
    missingRowsTreatedAsZero: false
    equalLengthAdjacentWindows: true
    clickDeltaBasis: 'after-minus-before'
    positionDeltaDefinition: 'after-minus-before-positive-is-worse'
    causeLanguage: 'signals-not-attribution'
  }
  filters: {
    limit: number
    unmatchedLimit: number
    maxRows: number
  }
  selection: SegmentImpactSelection
  summary: {
    matchedRows: number
    returnedRows: number
    unmatchedRows: number
    verdict: string
  }
  items: SegmentImpactItem[]
  unmatchedSegments: UnmatchedSegment[]
  warnings: string[]
  caveats: string[]
}
