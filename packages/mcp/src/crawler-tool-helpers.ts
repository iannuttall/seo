import {
  type crawlSite,
  listCrawlReports,
  loadCrawlReport,
  reviewObservations,
  SeoError,
  topFixes,
} from '@seo/core'

export function compactCrawlResult(
  report: Awaited<ReturnType<typeof crawlSite>>,
  opts: { includePages?: boolean; includeIssues?: boolean } = {},
) {
  const requestHeadline =
    report.requestEvidenceStatus === 'available'
      ? `Processed ${report.requests.length} URL requests into ${report.summary.totalPages} unique documents.`
      : report.requestEvidenceStatus === 'partial'
        ? `Observed ${report.requests.length} URL requests and retained ${report.summary.totalPages} unique documents; some started requests were still in flight when the crawl stopped.`
        : `Loaded ${report.summary.totalPages} unique documents; request evidence is unavailable for this legacy report.`
  const payload: Record<string, unknown> = {
    id: report.id,
    definitionId: report.definitionId,
    headline: `${requestHeadline} Found ${report.summary.highIssues} high, ${report.summary.mediumIssues} medium, and ${report.summary.lowIssues} low issues.`,
    status: report.status,
    requestEvidenceStatus: report.requestEvidenceStatus,
    configHash: report.configHash,
    config: report.config,
    access: report.access,
    summary: report.summary,
    dataSources: report.dataSources,
    ai: report.ai
      ? {
          robotsTxt: report.ai.robotsTxt,
          llmsTxt: report.ai.llmsTxt,
          agentResources: report.ai.agentResources,
        }
      : undefined,
    topFixes: topFixes(report, { limit: 10 }),
    reviewObservations: reviewObservations(report, { limit: 10 }),
    warnings: report.warnings,
    caveats: report.caveats,
  }
  if (opts.includeIssues) payload.issues = report.issues
  if (opts.includePages) {
    payload.requests = report.requests
    payload.pages = report.pages
  }
  return payload
}

export function resolveSavedReportAlias(input: {
  value?: string
  site?: string
  skipId?: string
}) {
  if (!input.value || input.value === 'latest' || input.value === 'previous') {
    const reports = listCrawlReports({ site: input.site, limit: 20 }).filter(
      (report) => report.id !== input.skipId,
    )
    const meta = input.value === 'previous' ? reports[1] : reports[0]
    return meta ? loadCrawlReport(meta.id) : undefined
  }
  return loadCrawlReport(input.value)
}

export function assertExclusiveReportInput(
  url?: string,
  reportId?: string,
): void {
  if (url && reportId) {
    throw new SeoError('INVALID_INPUT', 'Use either url or reportId, not both.')
  }
}
