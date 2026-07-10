import {
  type EffectiveSnippetControl,
  effectiveSnippetControl,
} from '../../robots-directives.js'
import type { CrawlReport } from './report.js'

export type GeoGapFilters = {
  limit?: number
}

export type GeoGap = {
  url: string
  issueCount: number
  issues: Array<{
    ruleId: string
    title: string
    severity: string
  }>
  searchEligibility: {
    successfulHtmlResponse: boolean
    crawlAllowed: boolean | null
    indexableCandidate: boolean
    declaredIndexability?: string
    indexability?: string
    snippetEligibility: EffectiveSnippetControl
  }
  observations: {
    semanticHtml: boolean
    structuredData: boolean
    hasAuthor: boolean
    hasDate: boolean
    questionHeadings: number
    structuredBlocks: number
    answerable: boolean
  }
}

export type GeoGapResult = {
  schemaVersion: 1
  dataStatus: 'complete' | 'partial' | 'unavailable'
  source: {
    provider: 'seo-crawl'
    reportId: string
    definitionId: string
    generatedAt: string
    startUrl: string
    crawlStatus: CrawlReport['status']
    requestEvidenceStatus: CrawlReport['requestEvidenceStatus']
    configuredMaxPages: number
    pageLimitReached: boolean
    discoveredUrls: number
    queuedUrls: number
    crawledUrls: number
    skippedUrls: number
    failedRequests: number
    extractionFailures: number
    partialReasons: Array<
      | 'no-pages-evaluated'
      | 'crawl-not-complete'
      | 'request-evidence-partial'
      | 'request-evidence-unavailable'
      | 'page-limit-reached'
      | 'skipped-urls'
      | 'failed-requests'
      | 'extraction-failures'
    >
  }
  selection: {
    evaluatedPages: number
    totalMatchedPages: number
    returnedPages: number
    limit: number
    truncated: boolean
  }
  eligibilityGaps: GeoGap[]
  warnings: string[]
  caveats: string[]
}

const ELIGIBILITY_RULES = new Set([
  'connection_error',
  'client_error',
  'server_error',
  'robots_blocked',
  'noindex',
  'x_robots_noindex',
  'canonicalized_page',
])

function matchingGeoGaps(report: CrawlReport): GeoGap[] {
  const eligibilityIssuesByUrl = new Map<string, GeoGap['issues']>()
  for (const issue of report.issues) {
    if (!ELIGIBILITY_RULES.has(issue.ruleId)) continue
    const issues = eligibilityIssuesByUrl.get(issue.url) ?? []
    issues.push({
      ruleId: issue.ruleId,
      title: issue.title,
      severity: issue.severity,
    })
    eligibilityIssuesByUrl.set(issue.url, issues)
  }

  return report.pages
    .map((page) => {
      const geo = page.geo ?? {
        semanticHtml: false,
        structuredData: false,
        hasAuthor: false,
        hasDate: false,
        questionHeadings: 0,
        structuredBlocks: 0,
        answerable: false,
      }
      const snippetEligibility = effectiveSnippetControl({
        metaRobots: page.metaRobots,
        xRobotsTag: page.xRobotsTag,
      })
      return {
        url: page.finalUrl,
        issueCount: eligibilityIssuesByUrl.get(page.url)?.length ?? 0,
        issues: eligibilityIssuesByUrl.get(page.url) ?? [],
        searchEligibility: {
          successfulHtmlResponse:
            page.status >= 200 &&
            page.status < 300 &&
            page.contentType?.toLowerCase().includes('text/html') === true,
          crawlAllowed: page.robotsTxt?.allowed ?? null,
          indexableCandidate: page.indexable,
          declaredIndexability: page.declaredIndexability,
          indexability: page.indexability,
          snippetEligibility,
        },
        observations: {
          semanticHtml: geo.semanticHtml,
          structuredData: geo.structuredData,
          hasAuthor: geo.hasAuthor,
          hasDate: geo.hasDate,
          questionHeadings: geo.questionHeadings,
          structuredBlocks: geo.structuredBlocks,
          answerable: geo.answerable,
        },
      }
    })
    .filter(
      (gap) =>
        gap.issueCount > 0 ||
        !gap.searchEligibility.successfulHtmlResponse ||
        gap.searchEligibility.crawlAllowed === false ||
        !gap.searchEligibility.indexableCandidate ||
        gap.searchEligibility.snippetEligibility.status !== 'not-restricted',
    )
    .sort((a, b) => b.issueCount - a.issueCount || a.url.localeCompare(b.url))
}

function partialReasons(
  report: CrawlReport,
): GeoGapResult['source']['partialReasons'] {
  const reasons: GeoGapResult['source']['partialReasons'] = []
  if (report.pages.length === 0) reasons.push('no-pages-evaluated')
  if (report.status !== 'completed') reasons.push('crawl-not-complete')
  if (report.requestEvidenceStatus === 'partial') {
    reasons.push('request-evidence-partial')
  }
  if (report.requestEvidenceStatus === 'unavailable') {
    reasons.push('request-evidence-unavailable')
  }
  if (report.summary.pageLimitReached) reasons.push('page-limit-reached')
  if (report.summary.skippedUrls > 0) reasons.push('skipped-urls')
  if (report.summary.failedRequests > 0) reasons.push('failed-requests')
  if (report.summary.extractionFailures > 0) {
    reasons.push('extraction-failures')
  }
  return reasons
}

export function geoGapsReport(
  report: CrawlReport,
  filters: GeoGapFilters = {},
): GeoGapResult {
  const matches = matchingGeoGaps(report)
  const limit = filters.limit ?? 50
  const eligibilityGaps = matches.slice(0, limit)
  const reasons = partialReasons(report)
  const truncated = eligibilityGaps.length < matches.length
  const dataStatus = report.pages.length
    ? reasons.length
      ? 'partial'
      : 'complete'
    : 'unavailable'

  return {
    schemaVersion: 1,
    dataStatus,
    source: {
      provider: 'seo-crawl',
      reportId: report.id,
      definitionId: report.definitionId,
      generatedAt: report.generatedAt,
      startUrl: report.config.url,
      crawlStatus: report.status,
      requestEvidenceStatus: report.requestEvidenceStatus,
      configuredMaxPages: report.config.maxPages,
      pageLimitReached: report.summary.pageLimitReached,
      discoveredUrls: report.summary.discoveredUrls,
      queuedUrls: report.summary.queuedUrls,
      crawledUrls: report.summary.crawledUrls,
      skippedUrls: report.summary.skippedUrls,
      failedRequests: report.summary.failedRequests,
      extractionFailures: report.summary.extractionFailures,
      partialReasons: reasons,
    },
    selection: {
      evaluatedPages: report.pages.length,
      totalMatchedPages: matches.length,
      returnedPages: eligibilityGaps.length,
      limit,
      truncated,
    },
    eligibilityGaps,
    warnings: report.warnings,
    caveats: [
      ...report.caveats,
      ...(truncated
        ? [
            `${matches.length - eligibilityGaps.length} matched pages were omitted by the output limit.`,
          ]
        : []),
      'No detected restriction among evaluated pages does not prove indexing, selection, visibility, or citation.',
    ],
  }
}

export function geoGaps(
  report: CrawlReport,
  filters: GeoGapFilters = {},
): GeoGap[] {
  return geoGapsReport(report, filters).eligibilityGaps
}
