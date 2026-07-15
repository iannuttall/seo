export type AiReferralMetrics = {
  sessions: number
  eventCount: number
}

export type AiReferralSourceDefinition = {
  id: string
  label: string
  domains: readonly string[]
}

export type AiReferralQueryEvidence = {
  status: 'complete' | 'partial' | 'skipped' | 'unavailable'
  calls: number
  returnedRows: number
  availableRows?: number
  timeZone?: string
  emptyReason?: string
  truncated: boolean
  warnings: string[]
}

export type AiReferralDataSource = {
  provider: 'google-analytics'
  api: 'analyticsdata.v1beta.runReport'
  maxRows: number
  calls: number
  possiblyTruncated: boolean
  sourceDiscovery: AiReferralQueryEvidence
  detail: AiReferralQueryEvidence
  totalUsers: AiReferralQueryEvidence
  partialReasons: string[]
}

export type AiReferralReport = {
  schemaVersion: 3
  property: string
  generatedAt: string
  dataStatus: 'complete' | 'partial'
  range: {
    startDate: string
    endDate: string
    kind: 'absolute' | 'relative'
  }
  methodology: {
    id: 'google-analytics-ai-referrals'
    version: 2
    attributionDimension: 'sessionSource'
    sourceRulesVersion: 'ai-referral-sources@1'
  }
  dataSource: AiReferralDataSource
  selection: {
    landingPages: {
      limit: number
      retainedRows: number
      returnedRows: number
      omittedRows: number
    }
  }
  summary: AiReferralMetrics & {
    totalUsers: number | null
    totalUsersStatus: 'available' | 'not-reported'
    sources: number
    landingPages: number
    verdict: string
    caveat: string
  }
  sources: Array<
    AiReferralMetrics & {
      id: string
      label: string
      /** @deprecated Use label. */
      source: string
      observedSessionSources: string[]
      /** @deprecated Distinct users cannot be attributed additively by source. */
      totalUsers: null
      shareOfAiSessions: number
      /** @deprecated Use shareOfAiSessions. */
      share: number
    }
  >
  landingPages: Array<
    AiReferralMetrics & {
      landingPage: string
      /** @deprecated Distinct users cannot be attributed additively by page. */
      totalUsers: null
      /** @deprecated Use topSourceDetails. */
      topSource: string
      topSourceDetails: { id: string; label: string }
    }
  >
  daily: Array<
    AiReferralMetrics & {
      date: string
      /** @deprecated Distinct users cannot be attributed additively by day. */
      totalUsers: null
    }
  >
  caveats: string[]
}
