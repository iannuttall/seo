import type { RuleCategory, RuleSeverity } from '../../rules.js'
import type { CrawlConfigInput, CrawlReport } from '../crawler/report.js'
import { type CrawlSiteDependencies, crawlSite } from '../crawler/site-crawl.js'
import { type TopFix, topFixes } from '../crawler/top-fixes.js'
import { scorePriority } from './priority-scoring.js'
import { workflowReport } from './report.js'
import type {
  PriorityQueueItem,
  WorkflowReport,
  WorkflowStep,
} from './types.js'

type CrawlPriorityCategory = PriorityQueueItem['category']
type QueueConfidence = PriorityQueueItem['confidence']

export type CrawlImplementationQueueItem = PriorityQueueItem & {
  ruleId: string
  severity: RuleSeverity
  affectedUrls: number
  sampleUrls: string[]
  whyThisRanks: string
  verification: TopFix['verification']
}

export type CrawlImplementationQueueOutput = {
  queue: CrawlImplementationQueueItem[]
  warnings: string[]
  crawl: CrawlReport
  topFixes: TopFix[]
}

export type CrawlImplementationQueueInput = CrawlConfigInput & {
  limit?: number
}

const CATEGORY_TO_PRIORITY: Record<RuleCategory, CrawlPriorityCategory> = {
  canonical: 'technical',
  content: 'content',
  geo: 'content',
  headings: 'content',
  images: 'content',
  indexability: 'technical',
  international: 'technical',
  links: 'technical',
  metadata: 'content',
  mobile: 'technical',
  performance: 'technical',
  response: 'technical',
  security: 'technical',
  social: 'content',
  'structured-data': 'technical',
}

const SEVERITY_IMPACT: Record<RuleSeverity, number> = {
  high: 100,
  medium: 50,
  low: 20,
}

function confidenceForFix(fix: TopFix): QueueConfidence {
  if (fix.severity === 'high') return 'high'
  if (
    fix.scoreFactors.searchVisibleUrls > 0 ||
    fix.scoreFactors.sessions > 0 ||
    fix.scoreFactors.conversions > 0
  ) {
    return 'high'
  }
  return fix.severity === 'medium' ? 'medium' : 'low'
}

function effortForFix(fix: TopFix): 'S' | 'M' | 'L' {
  if (fix.scoreFactors.effort === 'low') return 'S'
  if (fix.scoreFactors.effort === 'high') return 'L'
  return 'M'
}

function analyticsForFix(
  fix: TopFix,
): PriorityQueueItem['analytics'] | undefined {
  if (!fix.scoreFactors.sessions && !fix.scoreFactors.totalUsers) {
    return undefined
  }
  return {
    sessions: fix.scoreFactors.sessions,
    totalUsers: fix.scoreFactors.totalUsers,
  }
}

function impactForFix(fix: TopFix): number {
  return (
    SEVERITY_IMPACT[fix.severity] +
    fix.count * 10 +
    fix.scoreFactors.searchVisibleUrls * 25 +
    fix.scoreFactors.clicks * 5 +
    Math.min(fix.scoreFactors.impressions, 10_000) / 100 +
    fix.scoreFactors.sessions +
    fix.scoreFactors.conversions * 25
  )
}

export function crawlFixToQueueItem(fix: TopFix): CrawlImplementationQueueItem {
  const confidence = confidenceForFix(fix)
  const impact = Number(impactForFix(fix).toFixed(2))
  const scoreBreakdown = scorePriority({
    source: 'crawl',
    impact,
    confidence,
    effort: effortForFix(fix),
    templateCount: fix.count,
    analyticsSessions: fix.scoreFactors.sessions,
  })
  return {
    source: 'crawl',
    title: fix.title,
    target: fix.sampleUrls[0] ?? '',
    category: CATEGORY_TO_PRIORITY[fix.category],
    score: scoreBreakdown.final,
    impact,
    confidence,
    analytics: analyticsForFix(fix),
    action: fix.howToFix,
    evidence: fix.whyThisRanks,
    scoreBreakdown,
    ruleId: fix.ruleId,
    severity: fix.severity,
    affectedUrls: fix.count,
    sampleUrls: fix.sampleUrls,
    whyThisRanks: fix.whyThisRanks,
    verification: fix.verification,
  }
}

function joinStep(input: {
  tool: string
  enabled: boolean
  warningPrefix: string
  enabledSummary: string
  skippedSummary: string
  warnings: string[]
}): WorkflowStep {
  if (!input.enabled) {
    return {
      tool: input.tool,
      status: 'skipped',
      summary: input.skippedSummary,
    }
  }
  const warning = input.warnings.find((item) =>
    item.startsWith(input.warningPrefix),
  )
  return {
    tool: input.tool,
    status: warning ? 'skipped' : 'completed',
    summary: warning ?? input.enabledSummary,
  }
}

export async function crawlImplementationQueueWorkflow(
  input: CrawlImplementationQueueInput,
  dependencies?: CrawlSiteDependencies,
): Promise<WorkflowReport<CrawlImplementationQueueOutput>> {
  const crawl = await crawlSite(input, dependencies)
  const fixes = topFixes(crawl, { limit: input.limit ?? 25 })
  const queue = fixes.map(crawlFixToQueueItem).sort((a, b) => b.score - a.score)

  return workflowReport({
    workflow: 'crawl-implementation-queue',
    site: input.site ?? crawl.config.url,
    summary: `${queue.length} crawler fixes ranked from ${crawl.summary.totalPages} crawled pages.`,
    steps: [
      {
        tool: 'seo_crawl_site',
        status: crawl.status === 'failed' ? 'skipped' : 'completed',
        summary: `Crawled ${crawl.summary.totalPages} pages with ${crawl.issues.length} issues. Status: ${crawl.status}.`,
      },
      joinStep({
        tool: 'seo_gsc_page_metrics',
        enabled: Boolean(input.site),
        warningPrefix: 'GSC metrics skipped:',
        enabledSummary:
          'Joined Search Console page metrics where URLs matched.',
        skippedSummary: 'No GSC property was selected.',
        warnings: crawl.warnings,
      }),
      joinStep({
        tool: 'seo_google_analytics_landing_page_values',
        enabled: Boolean(input.googleAnalyticsPropertyId),
        warningPrefix: 'Google Analytics metrics skipped:',
        enabledSummary:
          'Joined Google Analytics landing-page value where URLs matched.',
        skippedSummary: 'No Google Analytics property was selected.',
        warnings: crawl.warnings,
      }),
      {
        tool: 'seo_top_crawl_fixes',
        status: 'completed',
        summary:
          'Grouped crawl issues, weighted them by severity, affected URLs, GSC visibility, Google Analytics value, and effort.',
      },
    ],
    actions: queue.slice(0, 5).map((item) => ({
      title: item.title,
      action: item.action,
      confidence: item.confidence,
    })),
    output: {
      queue,
      warnings: crawl.warnings,
      crawl,
      topFixes: fixes,
    },
  })
}
