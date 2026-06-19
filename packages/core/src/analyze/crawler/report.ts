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
  site?: string
  searchMetricsLimit?: number
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

export type CrawlReportSummary = {
  totalPages: number
  indexablePages: number
  nonIndexablePages: number
  statusErrors: number
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
}): string {
  const normalized = {
    config: normalizeCrawlConfig(input.config),
    site: input.site ?? null,
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

export function createCrawlReport(input: {
  config: CrawlConfigInput
  pages?: CrawlPageSnapshot[]
  issues?: CrawlIssue[]
  projectId?: string
  site?: string
  status?: CrawlReport['status']
  warnings?: string[]
  caveats?: string[]
  generatedAt?: string
}): CrawlReport {
  const config = normalizeCrawlConfig(input.config)
  const pages = input.pages ?? []
  const issues = input.issues ?? []
  return {
    id: crawlReportId({ config, site: input.site }),
    projectId: input.projectId,
    site: input.site,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: input.status ?? 'completed',
    configHash: crawlConfigHash(config),
    config,
    summary: summarizeCrawlReport({ pages, issues }),
    pages,
    issues,
    issueGroups: groupCrawlIssues(issues),
    warnings: input.warnings ?? [],
    caveats: input.caveats ?? [],
  }
}
