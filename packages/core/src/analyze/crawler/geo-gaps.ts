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
  signals: {
    semanticHtml: boolean
    structuredData: boolean
    hasAuthor: boolean
    hasDate: boolean
    questionHeadings: number
    structuredBlocks: number
    answerable: boolean
  }
}

export function geoGaps(
  report: CrawlReport,
  filters: GeoGapFilters = {},
): GeoGap[] {
  const geoIssuesByUrl = new Map<string, GeoGap['issues']>()
  for (const issue of report.issues) {
    if (issue.category !== 'geo') continue
    const issues = geoIssuesByUrl.get(issue.url) ?? []
    issues.push({
      ruleId: issue.ruleId,
      title: issue.title,
      severity: issue.severity,
    })
    geoIssuesByUrl.set(issue.url, issues)
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
      return {
        url: page.finalUrl,
        issueCount: geoIssuesByUrl.get(page.url)?.length ?? 0,
        issues: geoIssuesByUrl.get(page.url) ?? [],
        signals: {
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
    .filter((gap) => gap.issueCount > 0 || !gap.signals.structuredData)
    .sort(
      (a, b) =>
        b.issueCount - a.issueCount ||
        Number(a.signals.structuredData) - Number(b.signals.structuredData) ||
        a.url.localeCompare(b.url),
    )
    .slice(0, filters.limit ?? 50)
}
