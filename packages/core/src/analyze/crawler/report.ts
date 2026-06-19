import { createHash } from 'node:crypto'
import type { RuleCategory, RuleId, RuleSeverity } from '../../rules.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'

export type CrawlMode = 'site' | 'page' | 'list' | 'sitemap'

export type CrawlConfig = {
  url: string
  mode: CrawlMode
  urls: string[]
  maxPages: number
  maxDepth: number
  concurrency: number
  timeoutMs: number
  include: string[]
  exclude: string[]
  respectRobots: boolean
  useSitemap: boolean
  checkExternal: boolean
  js: boolean | 'auto'
}

export type CrawlConfigInput = Partial<CrawlConfig> & {
  url: string
  projectId?: string
  site?: string
  searchMetricsLimit?: number
  ga4PropertyId?: string
  analyticsLimit?: number
}

export type CrawlIssue = {
  ruleId: RuleId
  title: string
  category: RuleCategory
  severity: RuleSeverity
  url: string
  detail?: string
  evidence?: Record<string, unknown>
  searchMetrics?: CrawlPageSnapshot['searchMetrics']
}

export type CrawlIssueGroup = {
  ruleId: RuleId
  title: string
  category: RuleCategory
  severity: RuleSeverity
  count: number
  sampleUrls: string[]
}

export type CrawlRunStats = {
  discoveredUrls: number
  queuedUrls: number
  crawledUrls: number
  skippedUrls: number
  failedUrls: number
  verifiedLinks: number
}

export type CrawlReportSummary = {
  totalPages: number
  indexablePages: number
  nonIndexablePages: number
  statusErrors: number
  discoveredUrls: number
  queuedUrls: number
  crawledUrls: number
  skippedUrls: number
  failedUrls: number
  verifiedLinks: number
  healthScore: number
  geoReadinessScore: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  avgResponseMs?: number
  byStatus: Record<string, number>
  byCategory: Record<string, number>
}

export type CrawlReport = {
  id: string
  projectId?: string
  site?: string
  ga4PropertyId?: string
  generatedAt: string
  status: 'completed' | 'partial' | 'failed'
  configHash: string
  config: CrawlConfig
  summary: CrawlReportSummary
  pages: CrawlPageSnapshot[]
  issues: CrawlIssue[]
  issueGroups: CrawlIssueGroup[]
  warnings: string[]
  caveats: string[]
}

function uniqueSorted(values: string[] = []): string[] {
  return [...new Set(values.filter(Boolean))].sort()
}

export function normalizeCrawlConfig(input: CrawlConfigInput): CrawlConfig {
  return {
    url: new URL(input.url).toString(),
    mode: input.mode ?? 'site',
    urls: uniqueSorted(input.urls ?? []),
    maxPages: input.maxPages ?? 500,
    maxDepth: input.maxDepth ?? 16,
    concurrency: input.concurrency ?? 8,
    timeoutMs: input.timeoutMs ?? 20_000,
    include: uniqueSorted(input.include ?? []),
    exclude: uniqueSorted(input.exclude ?? []),
    respectRobots: input.respectRobots ?? true,
    useSitemap: input.useSitemap ?? true,
    checkExternal: input.checkExternal ?? true,
    js: input.js ?? 'auto',
  }
}

export function crawlConfigHash(config: CrawlConfigInput): string {
  const normalized = normalizeCrawlConfig(config)
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 16)
}

export function crawlReportId(input: {
  config: CrawlConfigInput
  site?: string
  ga4PropertyId?: string
}): string {
  const normalized = {
    config: normalizeCrawlConfig(input.config),
    site: input.site ?? null,
    ga4PropertyId: input.ga4PropertyId ?? null,
  }
  const hash = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 20)
  return `crawl_${hash}`
}

export function groupCrawlIssues(issues: CrawlIssue[]): CrawlIssueGroup[] {
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
    if (existing.sampleUrls.length < 10) {
      existing.sampleUrls.push(issue.url)
    }
    groups.set(issue.ruleId, existing)
  }
  const severityRank: Record<RuleSeverity, number> = {
    high: 3,
    medium: 2,
    low: 1,
  }
  return [...groups.values()].sort(
    (a, b) =>
      severityRank[b.severity] - severityRank[a.severity] || b.count - a.count,
  )
}

export function summarizeCrawlReport(input: {
  pages: CrawlPageSnapshot[]
  issues: CrawlIssue[]
  stats?: Partial<CrawlRunStats>
}): CrawlReportSummary {
  const byStatus: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  let responseMs = 0
  let responseCount = 0

  for (const page of input.pages) {
    byStatus[String(page.status)] = (byStatus[String(page.status)] ?? 0) + 1
    if (typeof page.responseTimeMs === 'number') {
      responseMs += page.responseTimeMs
      responseCount += 1
    }
  }
  for (const issue of input.issues) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1
  }

  return {
    totalPages: input.pages.length,
    indexablePages: input.pages.filter((page) => page.indexable).length,
    nonIndexablePages: input.pages.filter((page) => !page.indexable).length,
    statusErrors: input.pages.filter((page) => page.status >= 400).length,
    ...crawlRunStats(input.pages, input.stats),
    healthScore: averageScore(input.pages.map((page) => page.seoScore)),
    geoReadinessScore: averageScore(input.pages.map((page) => page.geoScore)),
    highIssues: input.issues.filter((issue) => issue.severity === 'high')
      .length,
    mediumIssues: input.issues.filter((issue) => issue.severity === 'medium')
      .length,
    lowIssues: input.issues.filter((issue) => issue.severity === 'low').length,
    avgResponseMs: responseCount
      ? Math.round(responseMs / responseCount)
      : undefined,
    byStatus,
    byCategory,
  }
}

function crawlRunStats(
  pages: CrawlPageSnapshot[],
  stats: Partial<CrawlRunStats> = {},
): CrawlRunStats {
  const discovered = new Set<string>()
  let verifiedLinks = 0
  for (const page of pages) {
    discovered.add(page.url)
    for (const url of page.sampleInternalLinks ?? []) discovered.add(url)
    for (const url of page.sampleExternalLinks ?? []) discovered.add(url)
    verifiedLinks +=
      page.outgoingInternalCount + (page.outgoingExternalCount ?? 0)
  }
  return {
    discoveredUrls: stats.discoveredUrls ?? discovered.size,
    queuedUrls: stats.queuedUrls ?? pages.length,
    crawledUrls: stats.crawledUrls ?? pages.length,
    skippedUrls: stats.skippedUrls ?? 0,
    failedUrls:
      stats.failedUrls ?? pages.filter((page) => page.status >= 400).length,
    verifiedLinks: stats.verifiedLinks ?? verifiedLinks,
  }
}

function averageScore(values: Array<number | undefined>): number {
  const scores = values.filter((value): value is number => value !== undefined)
  if (!scores.length) return 0
  return Math.round(
    scores.reduce((sum, value) => sum + value, 0) / scores.length,
  )
}

function severityPenalty(issue: CrawlIssue): number {
  if (issue.severity === 'high') return 30
  if (issue.severity === 'medium') return 15
  return 5
}

function pageSeoScore(page: CrawlPageSnapshot, issues: CrawlIssue[]): number {
  if (page.status >= 500) return 0
  if (page.status >= 400) return 10
  const penalty = issues
    .filter((issue) => issue.category !== 'geo')
    .reduce((sum, issue) => sum + severityPenalty(issue), 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}

function pageGeoScore(page: CrawlPageSnapshot, issues: CrawlIssue[]): number {
  const geo = page.geo
  let score = 100
  if (!geo?.semanticHtml) score -= 15
  if (!geo?.structuredData) score -= 25
  if (!geo?.hasAuthor) score -= 15
  if (!geo?.hasDate) score -= 5
  if (!geo?.answerable) score -= 20
  if ((geo?.questionHeadings ?? 0) === 0) score -= 5
  score -= issues
    .filter((issue) => issue.category === 'geo')
    .reduce((sum, issue) => sum + severityPenalty(issue), 0)
  return Math.max(0, Math.min(100, score))
}

function scorePages(
  pages: CrawlPageSnapshot[],
  issues: CrawlIssue[],
): CrawlPageSnapshot[] {
  const issuesByUrl = new Map<string, CrawlIssue[]>()
  for (const issue of issues) {
    issuesByUrl.set(issue.url, [...(issuesByUrl.get(issue.url) ?? []), issue])
  }
  return pages.map((page) => {
    const pageIssues = issuesByUrl.get(page.url) ?? []
    return {
      ...page,
      seoScore: pageSeoScore(page, pageIssues),
      geoScore: pageGeoScore(page, pageIssues),
    }
  })
}

export function createCrawlReport(input: {
  config: CrawlConfigInput
  pages?: CrawlPageSnapshot[]
  issues?: CrawlIssue[]
  projectId?: string
  site?: string
  ga4PropertyId?: string
  status?: CrawlReport['status']
  warnings?: string[]
  caveats?: string[]
  stats?: Partial<CrawlRunStats>
  generatedAt?: string
}): CrawlReport {
  const config = normalizeCrawlConfig(input.config)
  const issues = input.issues ?? []
  const pages = scorePages(input.pages ?? [], issues)
  return {
    id: crawlReportId({
      config,
      site: input.site,
      ga4PropertyId: input.ga4PropertyId,
    }),
    projectId: input.projectId,
    site: input.site,
    ga4PropertyId: input.ga4PropertyId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: input.status ?? 'completed',
    configHash: crawlConfigHash(config),
    config,
    summary: summarizeCrawlReport({ pages, issues, stats: input.stats }),
    pages,
    issues,
    issueGroups: groupCrawlIssues(issues),
    warnings: input.warnings ?? [],
    caveats: input.caveats ?? [],
  }
}

export function normalizeLoadedCrawlReport(report: CrawlReport): CrawlReport {
  const issues = report.issues ?? []
  const pages = scorePages(report.pages ?? [], issues)
  return {
    ...report,
    summary: summarizeCrawlReport({ pages, issues, stats: report.summary }),
    pages,
    issues,
    issueGroups: groupCrawlIssues(issues),
    warnings: report.warnings ?? [],
    caveats: report.caveats ?? [],
  }
}
