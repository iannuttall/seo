import { countLabel } from '../../phrasing.js'
import {
  crawlDiff,
  indexMonitor,
  indexWatch,
  linkRecover,
} from '../monitoring.js'
import { workflowReport } from './report.js'
import type { WorkflowReport } from './types.js'

type TechnicalWatchIndexOutput =
  | Awaited<ReturnType<typeof indexWatch>>
  | Awaited<ReturnType<typeof indexMonitor>>

function indexSummary(index?: TechnicalWatchIndexOutput): {
  inspected: number
  alerts: number
  currentIssues: number
  failed: number
  quotaBlocked: number
  deferred: number
} {
  return {
    inspected: index?.summary.inspected ?? 0,
    alerts: index?.summary.alerts ?? 0,
    currentIssues: index?.summary.currentIssues ?? 0,
    failed: index?.summary.failed ?? 0,
    quotaBlocked: index?.summary.quotaBlocked ?? 0,
    deferred: index?.summary.deferred ?? 0,
  }
}

export async function technicalWatchWorkflow(input: {
  site: string
  startUrl?: string
  urls?: string[]
  sitemaps?: string[]
  properties?: string[]
  limit?: number
  refresh?: boolean
  js?: boolean | 'auto'
  languageCode?: string
  dailyLimit?: number
  inspectLimit?: number
  maxUrls?: number
  recoverLinks?: boolean
  recoverDays?: number
  recoverLimit?: number
  recoverMinClicks?: number
  recoverMinImpressions?: number
}): Promise<
  WorkflowReport<{
    crawl?: Awaited<ReturnType<typeof crawlDiff>>
    index?: TechnicalWatchIndexOutput
    recovery?: Awaited<ReturnType<typeof linkRecover>>
  }>
> {
  const recoverLinks = input.recoverLinks ?? true
  const hasIndexInput = Boolean(input.urls?.length || input.sitemaps?.length)
  if (!input.startUrl && !hasIndexInput && !recoverLinks) {
    throw new Error(
      'Pass startUrl, urls, sitemaps, or enable link recovery for technical-watch.',
    )
  }

  const [crawl, index, recovery] = await Promise.all([
    input.startUrl
      ? crawlDiff({
          site: input.site,
          startUrl: input.startUrl,
          limit: input.limit,
          refresh: input.refresh,
          js: input.js,
        })
      : undefined,
    input.sitemaps?.length
      ? indexMonitor({
          site: input.site,
          sitemaps: input.sitemaps,
          properties: input.properties,
          dailyLimit: input.dailyLimit,
          inspectLimit: input.inspectLimit,
          maxUrls: input.maxUrls,
          languageCode: input.languageCode,
          refresh: input.refresh,
        })
      : input.urls?.length
        ? indexWatch({
            site: input.site,
            urls: input.urls,
            languageCode: input.languageCode,
            dailyLimit: input.dailyLimit,
          })
        : undefined,
    recoverLinks
      ? linkRecover({
          site: input.site,
          days: input.recoverDays,
          limit: input.recoverLimit ?? 10,
          minClicks: input.recoverMinClicks,
          minImpressions: input.recoverMinImpressions,
          refresh: input.refresh,
          js: input.js,
        })
      : undefined,
  ])
  const indexCounts = indexSummary(index)

  const findingCount =
    (crawl?.summary.highPriorityRecommendations ?? 0) +
    indexCounts.currentIssues +
    (recovery?.summary.high ?? 0) +
    (recovery?.summary.medium ?? 0)
  const incompleteChecks =
    indexCounts.failed + indexCounts.quotaBlocked + indexCounts.deferred
  const actions = []
  if (recovery?.items[0]) {
    actions.push({
      title: 'Recover search-value URL',
      action: recovery.items[0].recommendation.action,
      confidence: recovery.items[0].recommendation.confidence,
    })
  }
  if (findingCount > 0) {
    actions.push({
      title: 'Triage technical findings',
      action:
        'Prioritize current index issues, crawl actions, and recoverable search-value URLs before content work.',
      confidence: 'high' as const,
    })
  }
  if (incompleteChecks > 0) {
    actions.push({
      title: 'Complete URL Inspection coverage',
      action:
        'Retry failed or deferred URL Inspection checks after resolving access, provider, or quota errors. Do not treat incomplete checks as SEO defects.',
      confidence: 'high' as const,
    })
  }
  if (!actions.length) {
    actions.push({
      title: 'No material technical finding',
      action:
        'Keep the saved crawl and index snapshots; repeat the recovery check on the next run.',
      confidence: 'medium' as const,
    })
  }

  return workflowReport({
    workflow: 'technical-watch',
    site: input.site,
    summary: `${countLabel(findingCount, 'material technical finding')}; ${countLabel(incompleteChecks, 'incomplete URL Inspection check')}.`,
    steps: [
      {
        tool: 'seo_crawl_diff',
        status: crawl ? 'completed' : 'skipped',
        summary: crawl
          ? `Crawled ${countLabel(crawl.summary.crawled, 'URL')}; ${crawl.summary.changed} changed, ${countLabel(crawl.summary.highPriorityRecommendations, 'high-priority crawl action')}.`
          : 'No start URL passed.',
      },
      {
        tool: input.sitemaps?.length ? 'seo_index_monitor' : 'seo_index_watch',
        status: index ? 'completed' : 'skipped',
        summary: index
          ? `Inspected ${countLabel(indexCounts.inspected, 'selected URL')}; ${countLabel(indexCounts.currentIssues, 'current review in selected results')}, ${countLabel(indexCounts.alerts, 'new alert')}, ${countLabel(indexCounts.failed, 'failed check')}, ${indexCounts.quotaBlocked + indexCounts.deferred} quota-blocked or deferred.`
          : 'No inspection URLs or sitemaps passed.',
      },
      {
        tool: 'seo_link_recover',
        status: recovery ? 'completed' : 'skipped',
        summary: recovery
          ? `Checked ${countLabel(recovery.summary.checked, 'search-value URL')}; ${countLabel(recovery.summary.recoverable, 'recoverable issue')}, ${recovery.summary.high} high severity.`
          : 'Link recovery disabled.',
      },
    ],
    actions,
    output: { crawl, index, recovery },
  })
}
