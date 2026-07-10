import type { RuleCategory, RuleId, RuleSeverity } from '../../rules.js'
import type { CrawlIssue, CrawlReport } from './report.js'

export type AffectedUrlFilters = {
  ruleId?: string
  category?: string
  severity?: string
  limit?: number
}

export type AffectedUrl = {
  url: string
  ruleId: RuleId
  title: string
  category: RuleCategory
  severity: RuleSeverity
  detail?: string
  evidence?: Record<string, unknown>
  clicks: number
  impressions: number
  sessions: number
}

export type AffectedUrlSelection = {
  totalMatchedRows: number
  returnedRows: number
  limit: number
  truncated: boolean
}

export type AffectedUrlResult = {
  affectedUrls: AffectedUrl[]
  selection: AffectedUrlSelection
}

const severityRank: Record<RuleSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export function affectedUrls(
  report: CrawlReport,
  filters: AffectedUrlFilters = {},
): AffectedUrl[] {
  return selectAffectedUrls(report, filters).affectedUrls
}

export function selectAffectedUrls(
  report: CrawlReport,
  filters: AffectedUrlFilters = {},
): AffectedUrlResult {
  const pagesByUrl = new Map(
    report.pages.flatMap((page) => [
      [page.url, page],
      [page.finalUrl, page],
    ]),
  )
  const matches = report.issues
    .filter((issue) => matchesFilters(issue, filters))
    .map((issue) => {
      const page = pagesByUrl.get(issue.url)
      return {
        url: issue.url,
        ruleId: issue.ruleId,
        title: issue.title,
        category: issue.category,
        severity: issue.severity,
        detail: issue.detail,
        evidence: issue.evidence,
        clicks: issue.searchMetrics?.clicks ?? page?.searchMetrics?.clicks ?? 0,
        impressions:
          issue.searchMetrics?.impressions ??
          page?.searchMetrics?.impressions ??
          0,
        sessions: page?.analytics?.sessions ?? 0,
      }
    })
    .sort(
      (a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        b.sessions - a.sessions ||
        a.url.localeCompare(b.url),
    )
  const limit = filters.limit ?? 100
  const selected = matches.slice(0, limit)
  return {
    affectedUrls: selected,
    selection: {
      totalMatchedRows: matches.length,
      returnedRows: selected.length,
      limit,
      truncated: selected.length < matches.length,
    },
  }
}

function matchesFilters(
  issue: CrawlIssue,
  filters: AffectedUrlFilters,
): boolean {
  if (filters.ruleId && issue.ruleId !== filters.ruleId) return false
  if (filters.category && issue.category !== filters.category) return false
  if (filters.severity && issue.severity !== filters.severity) return false
  return true
}
