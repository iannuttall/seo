import type { CrawlReport } from './report.js'

export type OkfFile = {
  path: string
  content: string
}

export type OkfBundle = {
  schemaVersion: 2
  okfVersion: '0.2'
  reportId: string
  sourceUrl: string
  generatedAt: string
  crawlStatus: CrawlReport['status']
  rootTitle: string
  files: OkfFile[]
  conceptCount: number
  pageConceptCount: number
  selection: {
    sourcePages: number
    eligiblePages: number
    duplicateFinalUrls: number
    selectedPages: number
    limitedPages: number
    limit: number
    order: 'search-clicks-impressions-internal-authority-inlinks-url'
  }
  caveats: string[]
  warnings: string[]
}

export type OkfValidationSeverity = 'error' | 'warning'

export type OkfValidationIssue = {
  path: string
  severity: OkfValidationSeverity
  message: string
}

export type OkfValidationProfile = 'okf' | 'seo-export'

export type OkfValidationOptions = {
  profile?: OkfValidationProfile
  now?: Date | string
}

export type OkfTrustSummary = {
  unverified: number
  machineConfirmed: number
  humanReviewed: number
}

export type OkfLifecycleSummary = {
  draft: number
  stable: number
  deprecated: number
  invalid: number
}

export type OkfProvenanceSummary = {
  sources: number
  legacyCitations: number
  unspecified: number
}

export type OkfGenerationSummary = {
  generated: number
  legacyTimestamp: number
  unspecified: number
}

export type OkfFreshnessSummary = {
  fresh: number
  stale: number
  unspecified: number
  invalid: number
  evaluatedOn: string
}

export type OkfAttestationSummary = {
  concepts: number
  completeContracts: number
  incompleteContracts: number
  inlineComputations: number
  fileComputations: number
}

export type OkfValidationReport = {
  schemaVersion: 3
  profile: OkfValidationProfile
  formatVersion: string | null
  compatibility: 'v0.2' | 'v0.1' | 'undeclared' | 'best-effort'
  valid: boolean
  files: number
  concepts: number
  issueCounts: {
    errors: number
    warnings: number
  }
  issues: OkfValidationIssue[]
  issuesTruncated: boolean
  omittedIssues: number
  provenance: OkfProvenanceSummary
  generation: OkfGenerationSummary
  trust: OkfTrustSummary
  lifecycle: OkfLifecycleSummary
  freshness: OkfFreshnessSummary
  attestation: OkfAttestationSummary
  seoExport?: {
    pageConcepts: number
  }
}

export type OkfExplainReport = {
  title: string
  profile: OkfValidationProfile
  formatVersion: string | null
  compatibility: OkfValidationReport['compatibility']
  valid: boolean
  summary: string
  files: number
  concepts: number
  errors: number
  warnings: number
  provenance: OkfProvenanceSummary
  generation: OkfGenerationSummary
  trust: OkfTrustSummary
  lifecycle: OkfLifecycleSummary
  freshness: OkfFreshnessSummary
  attestation: OkfAttestationSummary
  nextActions: string[]
}
