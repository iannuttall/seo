import type {
  CrawlSkippedUrlsByImpact,
  CrawlSkipReasonCount,
} from './crawl-skip-reasons.js'
import type {
  CrawlConfig,
  CrawlReport,
  CrawlReportDataSources,
  CrawlReportSummary,
} from './report.js'

export type CrawlSnapshotCaps = {
  maxPages: number
  maxDepth: number
  timeoutMs: number
  searchConsolePageLimit?: number
  searchConsoleRetainedRowLimit?: number
  analyticsRetainedRowLimit?: number
}

export type CrawlSnapshotRequestScope = {
  startUrl: string
  mode: CrawlConfig['mode']
  explicitUrls: string[]
  include: string[]
  exclude: string[]
  respectRobots: boolean
  useSitemap: boolean
  checkExternal: boolean
  js: CrawlConfig['js']
}

export type CrawlSnapshotCompleteness = {
  status: 'complete' | 'partial' | 'failed'
  truncated: boolean
  reasons: string[]
  requestEvidenceStatus: CrawlReport['requestEvidenceStatus']
  pageLimitReached: boolean
  skippedUrls: number
  skipReasons: CrawlSkipReasonCount[]
  skippedUrlsByImpact: CrawlSkippedUrlsByImpact
  failedRequests: number
  abortedRequests: number
  extractionFailures: number
  dataSources?: CrawlReportDataSources
}

export type CrawlSnapshotInput = {
  id: string
  definitionId: string
  generatedAt: string
  projectId?: string
  site?: string
  googleAnalyticsPropertyId?: string
  url: string
  status: CrawlReport['status']
  configHash: string
  config: CrawlConfig
  caps: CrawlSnapshotCaps
  requestScope: CrawlSnapshotRequestScope
  requestEvidenceStatus: CrawlReport['requestEvidenceStatus']
  dataSources?: CrawlReportDataSources
  warnings: string[]
  caveats: string[]
  completeness: CrawlSnapshotCompleteness
  summary: CrawlReportSummary
}

export type CrawlComparisonMetadata = {
  before: CrawlSnapshotInput
  after: CrawlSnapshotInput
  comparability: {
    status: 'comparable' | 'review-required'
    sameDefinitionId: boolean
    sameConfigHash: boolean
    sameSite: boolean
    sameStartUrl: boolean
    sameMode: boolean
    sameRequestScope: boolean
    sameCaps: boolean
  }
  completeness: {
    status: 'complete' | 'partial' | 'failed'
    truncated: boolean
    before: CrawlSnapshotCompleteness
    after: CrawlSnapshotCompleteness
  }
  caveats: string[]
}

function snapshotCaps(report: CrawlReport): CrawlSnapshotCaps {
  return {
    maxPages: report.config.maxPages,
    maxDepth: report.config.maxDepth,
    timeoutMs: report.config.timeoutMs,
    searchConsolePageLimit: report.dataSources?.searchConsole.pageLimit,
    searchConsoleRetainedRowLimit:
      report.dataSources?.searchConsole.retainedRowLimit,
    analyticsRetainedRowLimit: report.dataSources?.analytics.retainedRowLimit,
  }
}

function requestScope(report: CrawlReport): CrawlSnapshotRequestScope {
  return {
    startUrl: report.config.url,
    mode: report.config.mode,
    explicitUrls: report.config.urls,
    include: report.config.include,
    exclude: report.config.exclude,
    respectRobots: report.config.respectRobots,
    useSitemap: report.config.useSitemap,
    checkExternal: report.config.checkExternal,
    js: report.config.js,
  }
}

function sourceTruncated(report: CrawlReport): boolean {
  return Boolean(
    report.dataSources?.searchConsole.pageLimitReached ||
      report.dataSources?.searchConsole.retainedRowLimitReached ||
      report.dataSources?.analytics.retainedRowLimitReached,
  )
}

function completenessReasons(report: CrawlReport): string[] {
  const reasons: string[] = []
  if (report.status !== 'completed') {
    reasons.push(`report-status-${report.status}`)
  }
  if (report.summary.pageLimitReached) reasons.push('crawl-page-limit-reached')
  if (report.requestEvidenceStatus !== 'available') {
    reasons.push(`request-evidence-${report.requestEvidenceStatus}`)
  }
  if (report.summary.skippedUrlsByImpact.coverageAffecting > 0) {
    reasons.push('coverage-affecting-urls-skipped')
  }
  if (report.summary.failedRequests > 0) reasons.push('requests-failed')
  if (report.summary.abortedRequests > 0) reasons.push('requests-aborted')
  if (report.summary.extractionFailures > 0) {
    reasons.push('document-extraction-failed')
  }
  if (report.dataSources?.searchConsole.pageLimitReached) {
    reasons.push('search-console-page-limit-reached')
  }
  if (report.dataSources?.searchConsole.retainedRowLimitReached) {
    reasons.push('search-console-row-limit-reached')
  }
  if (report.dataSources?.analytics.retainedRowLimitReached) {
    reasons.push('analytics-row-limit-reached')
  }
  if (
    report.dataSources?.searchConsole.status === 'partial' ||
    report.dataSources?.searchConsole.status === 'unavailable'
  ) {
    reasons.push(`search-console-${report.dataSources.searchConsole.status}`)
  }
  if (
    report.dataSources?.analytics.status === 'partial' ||
    report.dataSources?.analytics.status === 'unavailable'
  ) {
    reasons.push(`analytics-${report.dataSources.analytics.status}`)
  }
  return reasons
}

function snapshotCompleteness(report: CrawlReport): CrawlSnapshotCompleteness {
  const reasons = completenessReasons(report)
  return {
    status:
      report.status === 'failed'
        ? 'failed'
        : reasons.length
          ? 'partial'
          : 'complete',
    truncated: report.summary.pageLimitReached || sourceTruncated(report),
    reasons,
    requestEvidenceStatus: report.requestEvidenceStatus,
    pageLimitReached: report.summary.pageLimitReached,
    skippedUrls: report.summary.skippedUrls,
    skipReasons: report.summary.skipReasons,
    skippedUrlsByImpact: report.summary.skippedUrlsByImpact,
    failedRequests: report.summary.failedRequests,
    abortedRequests: report.summary.abortedRequests,
    extractionFailures: report.summary.extractionFailures,
    dataSources: report.dataSources,
  }
}

function snapshotInput(report: CrawlReport): CrawlSnapshotInput {
  const completeness = snapshotCompleteness(report)
  return {
    id: report.id,
    definitionId: report.definitionId,
    generatedAt: report.generatedAt,
    projectId: report.projectId,
    site: report.site,
    googleAnalyticsPropertyId: report.googleAnalyticsPropertyId,
    url: report.config.url,
    status: report.status,
    configHash: report.configHash,
    config: report.config,
    caps: snapshotCaps(report),
    requestScope: requestScope(report),
    requestEvidenceStatus: report.requestEvidenceStatus,
    dataSources: report.dataSources,
    warnings: report.warnings,
    caveats: report.caveats,
    completeness,
    summary: report.summary,
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function comparisonCaveats(input: {
  before: CrawlSnapshotInput
  after: CrawlSnapshotInput
  comparability: CrawlComparisonMetadata['comparability']
}): string[] {
  const caveats: string[] = []
  if (!input.comparability.sameSite) {
    caveats.push('The reports use different site properties.')
  }
  if (!input.comparability.sameRequestScope) {
    caveats.push(
      'The reports use different crawl request scopes; added and removed pages may reflect scope changes.',
    )
  }
  if (!input.comparability.sameCaps) {
    caveats.push(
      'The reports use different crawl or provider caps; compare retained coverage before interpreting deltas.',
    )
  }
  if (
    !input.comparability.sameConfigHash &&
    input.comparability.sameRequestScope &&
    input.comparability.sameCaps
  ) {
    caveats.push(
      'The crawl configurations differ outside request scope and caps; inspect both config objects before attribution.',
    )
  }
  if (!input.comparability.sameDefinitionId) {
    caveats.push(
      'The reports use different crawl definitions; do not attribute every delta to the site or a release.',
    )
  }
  if (input.before.completeness.status !== 'complete') {
    caveats.push(
      `The baseline report is ${input.before.completeness.status}: ${input.before.completeness.reasons.join(', ')}.`,
    )
  }
  if (input.after.completeness.status !== 'complete') {
    caveats.push(
      `The newer report is ${input.after.completeness.status}: ${input.after.completeness.reasons.join(', ')}.`,
    )
  }
  if (
    input.before.completeness.truncated ||
    input.after.completeness.truncated
  ) {
    caveats.push(
      'At least one report was truncated; page and issue deltas describe retained evidence only.',
    )
  }
  if (input.after.generatedAt <= input.before.generatedAt) {
    caveats.push(
      'The report labelled after is not newer than the report labelled before.',
    )
  }
  if (
    input.before.warnings.length ||
    input.after.warnings.length ||
    input.before.caveats.length ||
    input.after.caveats.length
  ) {
    caveats.push(
      'One or both saved reports contain source warnings or caveats; inspect them before acting.',
    )
  }
  return caveats
}

export function crawlComparisonMetadata(input: {
  before: CrawlReport
  after: CrawlReport
}): CrawlComparisonMetadata {
  const before = snapshotInput(input.before)
  const after = snapshotInput(input.after)
  const baseComparability = {
    sameDefinitionId: before.definitionId === after.definitionId,
    sameConfigHash: before.configHash === after.configHash,
    sameSite: before.site === after.site,
    sameStartUrl: before.url === after.url,
    sameMode: before.config.mode === after.config.mode,
    sameRequestScope: sameValue(before.requestScope, after.requestScope),
    sameCaps: sameValue(before.caps, after.caps),
  }
  const inputsMatch = Object.values(baseComparability).every(Boolean)
  const evidenceComplete =
    before.completeness.status === 'complete' &&
    after.completeness.status === 'complete'
  const comparability: CrawlComparisonMetadata['comparability'] = {
    status: inputsMatch && evidenceComplete ? 'comparable' : 'review-required',
    ...baseComparability,
  }
  const status =
    before.completeness.status === 'failed' ||
    after.completeness.status === 'failed'
      ? 'failed'
      : before.completeness.status === 'partial' ||
          after.completeness.status === 'partial'
        ? 'partial'
        : 'complete'
  return {
    before,
    after,
    comparability,
    completeness: {
      status,
      truncated: before.completeness.truncated || after.completeness.truncated,
      before: before.completeness,
      after: after.completeness,
    },
    caveats: comparisonCaveats({ before, after, comparability }),
  }
}
