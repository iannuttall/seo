export type CtrUnderperformerSelection = {
  sourceRows: number
  invalidRows: number
  validRows: number
  duplicateRows: number
  aggregatedRows: number
  outsidePageOneRows: number
  lowActionabilityRows: number
  brandRows: number
  benchmarkRows: number
  belowMinimumRows: number
  evaluatedRows: number
  eligibleUnderperformers: number
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
