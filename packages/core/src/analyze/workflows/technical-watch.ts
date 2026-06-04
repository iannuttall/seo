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
} {
  return {
    inspected: index?.summary.inspected ?? 0,
    alerts: index?.summary.alerts ?? 0,
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

  const alertCount =
    (crawl?.summary.highPriorityRecommendations ?? 0) +
    indexCounts.alerts +
    (recovery?.summary.high ?? 0) +
    (recovery?.summary.medium ?? 0)
  const actions =
    alertCount > 0
      ? [
          ...(recovery?.items[0]
            ? [
                {
                  title: 'Recover search-value URL',
                  action: recovery.items[0].recommendation.action,
                  confidence: recovery.items[0].recommendation.confidence,
                },
              ]
            : []),
          {
            title: 'Triage technical alerts',
            action:
              'Prioritize new status errors, indexability flips, URL Inspection alerts, and recoverable search-value URLs before content work.',
            confidence: 'high' as const,
          },
        ]
      : [
          {
            title: 'No material technical alert',
            action:
              'Keep the saved crawl and index snapshots; repeat the recovery check on the next run.',
            confidence: 'medium' as const,
          },
        ]

  return workflowReport({
    workflow: 'technical-watch',
    site: input.site,
    summary: `${countLabel(alertCount, 'material technical alert')} found.`,
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
          ? `Inspected ${countLabel(indexCounts.inspected, 'URL')}; ${countLabel(indexCounts.alerts, 'alert')}.`
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
