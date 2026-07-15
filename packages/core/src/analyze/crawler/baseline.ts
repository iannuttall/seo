import type { CrawlConfigInput, CrawlReport } from './report.js'
import { latestCrawlReport, saveCrawlReport } from './report-store.js'
import { crawlSite } from './site-crawl.js'

export const REPORT_BASELINE_MAX_PAGES = 100
export const REPORT_BASELINE_MAX_DEPTH = 4
export const REPORT_BASELINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type TechnicalBaselineStatus =
  | 'created'
  | 'refreshed'
  | 'reused'
  | 'skipped'
  | 'unavailable'

export type TechnicalBaseline = {
  status: TechnicalBaselineStatus
  report?: CrawlReport
  reason?: string
}

export type ResolveTechnicalBaselineInput = {
  /** Stable local identity used to find and save the crawl baseline. */
  site: string
  /** Optional verified Search Console property used for Google data joins. */
  searchSite?: string
  url?: string
  projectId?: string
  googleAnalyticsPropertyId?: string
  crawl?: boolean
  refresh?: boolean
  maxPages?: number
  maxDepth?: number
  maxAgeMs?: number
}

export type TechnicalBaselineDependencies = {
  latestCrawlReport: typeof latestCrawlReport
  crawlSite: typeof crawlSite
  saveCrawlReport: typeof saveCrawlReport
  now: () => Date
}

const defaultDependencies: TechnicalBaselineDependencies = {
  latestCrawlReport,
  crawlSite,
  saveCrawlReport,
  now: () => new Date(),
}

function normalizePathname(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function crawlCoversUrl(crawlUrl: string, targetUrl: string): boolean {
  try {
    const crawl = new URL(crawlUrl)
    const target = new URL(targetUrl)
    return (
      crawl.origin === target.origin &&
      normalizePathname(target.pathname).startsWith(
        normalizePathname(crawl.pathname),
      )
    )
  } catch {
    return false
  }
}

export function isCompatibleTechnicalBaseline(
  report: CrawlReport,
  input: Pick<ResolveTechnicalBaselineInput, 'url' | 'maxPages' | 'maxDepth'>,
): boolean {
  const maxPages = input.maxPages ?? REPORT_BASELINE_MAX_PAGES
  const maxDepth = input.maxDepth ?? REPORT_BASELINE_MAX_DEPTH

  return (
    (report.status === 'completed' || report.status === 'partial') &&
    report.config.mode === 'site' &&
    report.config.maxPages >= maxPages &&
    report.config.maxDepth >= maxDepth &&
    report.config.include.length === 0 &&
    report.config.exclude.length === 0 &&
    report.config.useSitemap &&
    report.config.respectRobots &&
    (!input.url || crawlCoversUrl(report.config.url, input.url))
  )
}

export function isCurrentTechnicalBaseline(
  report: CrawlReport,
  input: Pick<ResolveTechnicalBaselineInput, 'maxAgeMs'> & { now: Date },
): boolean {
  const generatedAt = Date.parse(report.generatedAt)
  const maxAgeMs = input.maxAgeMs ?? REPORT_BASELINE_MAX_AGE_MS
  const ageMs = input.now.getTime() - generatedAt
  return Number.isFinite(generatedAt) && ageMs >= 0 && ageMs <= maxAgeMs
}

function unavailableReason(report: CrawlReport): string {
  const detail = report.warnings[0] ?? report.caveats[0]
  return detail
    ? `The technical crawl did not complete: ${detail}`
    : 'The technical crawl did not complete.'
}

function crawlInput(
  input: Required<
    Pick<
      ResolveTechnicalBaselineInput,
      'site' | 'url' | 'maxPages' | 'maxDepth'
    >
  > &
    Pick<
      ResolveTechnicalBaselineInput,
      'projectId' | 'googleAnalyticsPropertyId' | 'refresh' | 'searchSite'
    >,
): CrawlConfigInput {
  return {
    url: input.url,
    ...(input.searchSite ? { site: input.searchSite } : {}),
    projectId: input.projectId,
    googleAnalyticsPropertyId: input.googleAnalyticsPropertyId,
    mode: 'site',
    maxPages: input.maxPages,
    maxDepth: input.maxDepth,
    respectRobots: true,
    useSitemap: true,
    checkExternal: false,
    js: false,
    refresh: input.refresh ?? false,
  }
}

export async function resolveTechnicalBaseline(
  input: ResolveTechnicalBaselineInput,
  dependencies: TechnicalBaselineDependencies = defaultDependencies,
): Promise<TechnicalBaseline> {
  if (input.crawl === false) {
    return {
      status: 'skipped',
      reason: 'Technical crawl evidence was skipped with --no-crawl.',
    }
  }

  const maxPages = input.maxPages ?? REPORT_BASELINE_MAX_PAGES
  const maxDepth = input.maxDepth ?? REPORT_BASELINE_MAX_DEPTH
  const existing = dependencies.latestCrawlReport(input.site)

  if (
    !input.refresh &&
    existing &&
    isCompatibleTechnicalBaseline(existing, { ...input, maxPages, maxDepth }) &&
    isCurrentTechnicalBaseline(existing, { ...input, now: dependencies.now() })
  ) {
    return { status: 'reused', report: existing }
  }

  if (!input.url) {
    return {
      status: 'unavailable',
      reason:
        'No crawl URL is saved for this site. Add one to the project profile or run `seo crawl --url <url> --save`.',
    }
  }

  try {
    const report = await dependencies.crawlSite(
      crawlInput({ ...input, url: input.url, maxPages, maxDepth }),
    )
    if (report.status === 'failed') {
      return { status: 'unavailable', reason: unavailableReason(report) }
    }
    dependencies.saveCrawlReport(report)
    return {
      status: input.refresh ? 'refreshed' : 'created',
      report,
      ...(report.status === 'partial'
        ? { reason: 'The technical crawl completed with partial coverage.' }
        : {}),
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `The technical crawl could not run: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
