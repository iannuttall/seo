import {
  explainRule,
  type RuleCategory,
  type RuleSeverity,
} from '../../rules.js'
import type { CrawlIssue, CrawlIssueGroup, CrawlReport } from './report.js'

export type TopFixFilters = {
  category?: RuleCategory | string
  severity?: RuleSeverity | string
  url?: string
  projectId?: string
  limit?: number
}

export type TopFix = CrawlIssueGroup & {
  score: number
  scoreFactors: {
    severity: number
    affectedUrls: number
    searchVisibleUrls: number
    clicks: number
    impressions: number
    sessions: number
    totalUsers: number
    conversions: number
    avgPosition?: number
    effort: 'low' | 'medium' | 'high'
    effortScore: number
  }
  whyThisRanks: string
  howToFix: string
  howToVerify: string
  verification: {
    command: string
    expected: string
  }
}

const SEVERITY_SCORE: Record<RuleSeverity, number> = {
  high: 5000,
  medium: 1200,
  low: 100,
}

const EFFORT_BY_CATEGORY: Partial<
  Record<RuleCategory, TopFix['scoreFactors']['effort']>
> = {
  canonical: 'medium',
  content: 'high',
  geo: 'medium',
  headings: 'low',
  images: 'medium',
  indexability: 'medium',
  international: 'low',
  metadata: 'low',
  mobile: 'low',
  response: 'medium',
  security: 'medium',
  social: 'low',
  'structured-data': 'medium',
}

const EFFORT_SCORE: Record<TopFix['scoreFactors']['effort'], number> = {
  low: 60,
  medium: 30,
  high: 0,
}

const AFFECTED_URL_WEIGHT: Record<RuleSeverity, number> = {
  high: 25,
  medium: 15,
  low: 2,
}

const VALUE_WEIGHT: Record<RuleSeverity, number> = {
  high: 1,
  medium: 0.75,
  low: 0.15,
}

function matchesPattern(pattern: string, value: string): boolean {
  if (!pattern.includes('*')) return value.includes(pattern)
  const parts = pattern.split('*')
  let position = 0
  for (const part of parts) {
    if (!part) continue
    const found = value.slice(position).indexOf(part)
    if (found === -1) return false
    position += found + part.length
  }
  return true
}

function filteredIssues(
  report: CrawlReport,
  filters: TopFixFilters,
): CrawlIssue[] {
  if (filters.projectId && report.projectId !== filters.projectId) return []
  return report.issues.filter((issue) => {
    if (filters.category && issue.category !== filters.category) return false
    if (filters.severity && issue.severity !== filters.severity) return false
    if (filters.url && !matchesPattern(filters.url, issue.url)) return false
    return true
  })
}

function groupIssues(issues: CrawlIssue[]): CrawlIssueGroup[] {
  const groups = new Map<string, CrawlIssueGroup>()
  for (const issue of issues) {
    const existing = groups.get(issue.ruleId) ?? {
      ruleId: issue.ruleId,
      title: issue.title,
      category: issue.category,
      severity: issue.severity,
      count: 0,
      sampleUrls: [],
    }
    existing.count += 1
    if (existing.sampleUrls.length < 10) existing.sampleUrls.push(issue.url)
    groups.set(issue.ruleId, existing)
  }
  return [...groups.values()]
}

function searchValueForGroup(report: CrawlReport, urls: string[]) {
  const wanted = new Set(urls)
  const pages = report.pages.filter(
    (page) => wanted.has(page.url) || wanted.has(page.finalUrl),
  )
  const metrics = pages
    .map((page) => page.searchMetrics)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const clicks = metrics.reduce((sum, item) => sum + item.clicks, 0)
  const impressions = metrics.reduce((sum, item) => sum + item.impressions, 0)
  const sessions = pages.reduce(
    (sum, page) => sum + (page.analytics?.sessions ?? 0),
    0,
  )
  const totalUsers = pages.reduce(
    (sum, page) => sum + (page.analytics?.totalUsers ?? 0),
    0,
  )
  const conversions = pages.reduce(
    (sum, page) => sum + (page.analytics?.conversions ?? 0),
    0,
  )
  const avgPosition = metrics.length
    ? metrics.reduce((sum, item) => sum + item.position, 0) / metrics.length
    : undefined
  return {
    searchVisibleUrls: metrics.length,
    clicks,
    impressions,
    sessions,
    totalUsers,
    conversions,
    avgPosition,
  }
}

function whyThisRanks(input: TopFix['scoreFactors']): string {
  const visibility = input.searchVisibleUrls
    ? `${input.searchVisibleUrls} affected URLs have GSC visibility (${input.clicks} clicks, ${input.impressions} impressions).`
    : 'No affected URL has joined GSC visibility yet.'
  const analytics = input.sessions
    ? ` GA4 adds ${input.sessions} sessions and ${input.conversions} conversions from affected landing pages.`
    : ''
  return `${visibility}${analytics} Severity contributes ${input.severity}; affected URL count contributes ${input.affectedUrls}; effort is ${input.effort}.`
}

function verificationCommand(
  report: CrawlReport,
  severity: RuleSeverity,
): string {
  return `seo crawl ${report.config.url} --severity ${severity} --max-pages ${Math.min(report.config.maxPages, 100)}`
}

export function topFixes(
  report: CrawlReport,
  filters: TopFixFilters = {},
): TopFix[] {
  const groups = groupIssues(filteredIssues(report, filters))
  const fixes = groups.map((group): TopFix => {
    const search = searchValueForGroup(report, group.sampleUrls)
    const effort = EFFORT_BY_CATEGORY[group.category] ?? 'medium'
    const scoreFactors = {
      severity: SEVERITY_SCORE[group.severity],
      affectedUrls: group.count,
      searchVisibleUrls: search.searchVisibleUrls,
      clicks: search.clicks,
      impressions: search.impressions,
      sessions: search.sessions,
      totalUsers: search.totalUsers,
      conversions: search.conversions,
      avgPosition: search.avgPosition,
      effort,
      effortScore: EFFORT_SCORE[effort],
    }
    const valueWeight = VALUE_WEIGHT[group.severity]
    const score =
      scoreFactors.severity +
      scoreFactors.affectedUrls * AFFECTED_URL_WEIGHT[group.severity] +
      scoreFactors.searchVisibleUrls * 100 * valueWeight +
      scoreFactors.clicks * 20 * valueWeight +
      (Math.min(scoreFactors.impressions, 10_000) / 25) * valueWeight +
      scoreFactors.sessions * 2 * valueWeight +
      scoreFactors.conversions * 100 * valueWeight +
      scoreFactors.effortScore
    const rule = explainRule(group.ruleId)
    return {
      ...group,
      score: Math.round(score),
      scoreFactors,
      whyThisRanks: whyThisRanks(scoreFactors),
      howToFix: rule?.howToFix ?? '',
      howToVerify: rule?.howToVerify ?? '',
      verification: {
        command: verificationCommand(report, group.severity),
        expected: rule?.howToVerify ?? '',
      },
    }
  })

  return fixes
    .sort(
      (a, b) =>
        b.score - a.score ||
        SEVERITY_SCORE[b.severity] - SEVERITY_SCORE[a.severity] ||
        b.count - a.count ||
        a.ruleId.localeCompare(b.ruleId),
    )
    .slice(0, filters.limit ?? 10)
}
