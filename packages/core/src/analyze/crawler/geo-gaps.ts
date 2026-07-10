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

const ELIGIBILITY_RULES = new Set([
  'connection_error',
  'client_error',
  'server_error',
  'robots_blocked',
  'noindex',
  'x_robots_noindex',
  'canonicalized_page',
])

export function geoGaps(
  report: CrawlReport,
  filters: GeoGapFilters = {},
): GeoGap[] {
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
    .slice(0, filters.limit ?? 50)
}
