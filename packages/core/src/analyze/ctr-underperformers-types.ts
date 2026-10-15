import type { QueryFlag } from './query-quality.js'

export type CtrUnderperformerSelection = {
  sourceRows: number
  invalidRows: number
  validRows: number
  /** Source rows whose page URL had a #fragment; merged into the base URL. */
  fragmentRows: number
  duplicateRows: number
  aggregatedRows: number
  outsidePageOneRows: number
  lowActionabilityRows: number
  brandRows: number
  benchmarkRows: number
  /** Page-one rows at average position 4 or worse; quick-wins reviews them. */
  outsideCandidatePositionRows: number
  belowMinimumRows: number
  evaluatedRows: number
  eligibleUnderperformers: number
  likelyAutomatedRows: number
  navigationalOtherRows: number
  flaggedRows: number
  returnedUnderperformers: number
  limitedUnderperformers: number
}

export type CtrUnderperformer = {
  query: string
  url: string
  position: number
  impressions: number
  actualCtr: number
  expectedCtr: number
  clicks: number
  expectedClicks: number
  clickShortfall: number
  /** Heuristic labels; flagged rows rank after unflagged rows. */
  queryFlags: QueryFlag[]
  benchmark: {
    expectedCtr: number
    source: string
    peerRows: number
    peerImpressions: number
    qualifiedPeerImpressions: number
    urlSamples: number
    positiveUrlSamples: number
  }
  recommendation: {
    principle: 'C.3'
    evidenceRef: string
    action: string
    effort: 'S'
    confidence: 'low'
  }
}
