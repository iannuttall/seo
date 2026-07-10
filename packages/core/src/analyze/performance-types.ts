export type PerformanceRating = 'good' | 'needs-work' | 'poor' | 'unknown'

export type PerformanceMetric = {
  value?: number
  displayValue?: string
  score?: number
  rating?: PerformanceRating
  source?: 'lighthouse-lab' | 'fetch-fallback'
}

export type PerformanceFieldMetric = {
  p75: number
  unit: 'milliseconds' | 'score'
  rating: Exclude<PerformanceRating, 'unknown'>
}

export type PerformanceFieldData = {
  source: 'crux'
  status: 'available'
  scope: 'origin' | 'url'
  formFactor: 'DESKTOP' | 'PHONE'
  url?: string
  origin?: string
  collectionPeriod?: {
    firstDate?: string
    lastDate?: string
  }
  metrics: {
    cumulativeLayoutShift?: PerformanceFieldMetric
    interactionToNextPaint?: PerformanceFieldMetric
    largestContentfulPaint?: PerformanceFieldMetric
  }
  rawMetrics: Record<string, unknown>
  assessment: {
    status: 'good' | 'incomplete' | 'needs-work' | 'poor'
    availableMetrics: number
    missingMetrics: Array<'CLS' | 'INP' | 'LCP'>
  }
}

export type LighthouseFailureCode =
  | 'binary_missing'
  | 'chrome_missing'
  | 'invalid_result'
  | 'run_failed'
  | 'timeout'

export type PerformanceAuditReport = {
  schemaVersion: 1
  methodology: 'performance-v2'
  dataStatus: 'complete' | 'partial'
  id: string
  url: string
  finalUrl?: string
  strategy: 'mobile' | 'desktop'
  generatedAt: string
  cache: {
    status: 'bypass' | 'hit' | 'miss'
    ttlHours: number
  }
  source: 'lighthouse' | 'fetch-fallback'
  score?: number
  grade: PerformanceRating
  headline: string
  metrics: {
    firstContentfulPaint?: PerformanceMetric
    largestContentfulPaint?: PerformanceMetric
    totalBlockingTime?: PerformanceMetric
    cumulativeLayoutShift?: PerformanceMetric
    interactionToNextPaint?: PerformanceMetric
    speedIndex?: PerformanceMetric
    serverResponseTime?: PerformanceMetric
    fallbackFetchDuration?: PerformanceMetric
  }
  labInsights: Array<{
    id: string
    title: string
    displayValue?: string
    score?: number | null
    estimatedSavingsMs?: number
    evidence: Array<Record<string, string | number | boolean>>
  }>
  labDataStatus: {
    provider: 'lighthouse'
    status: 'available' | 'unavailable'
    reason: string
    failureCode?: LighthouseFailureCode
  }
  fallbackEvidence?: {
    requestedUrl: string
    finalUrl: string
    httpStatus: number
    blocked: boolean
    redirectCount: number
  }
  fieldData?: PerformanceFieldData
  fieldDataStatus: {
    provider: 'crux'
    status:
      | 'not_configured'
      | 'available'
      | 'unavailable_no_coverage'
      | 'request_failed'
    reason: string
    checkedUrl: string
    checkedOrigin: string
    formFactor: 'DESKTOP' | 'PHONE'
    httpStatus?: number
  }
  topActions: Array<{
    title: string
    plainEnglish: string
    action: string
    evidence?: Record<string, unknown>
  }>
  caveats: string[]
  raw?: unknown
}
