import { crawlDiff, indexWatch, linkRecover } from '../monitoring.js'
import { workflowReport } from './report.js'
import type { WorkflowReport } from './types.js'

export async function technicalWatchWorkflow(input: {
  site: string
  startUrl?: string
  urls?: string[]
  limit?: number
  refresh?: boolean
  js?: boolean | 'auto'
  languageCode?: string
  recoverLinks?: boolean
  recoverDays?: number
  recoverLimit?: number
  recoverMinClicks?: number
  recoverMinImpressions?: number
}): Promise<
  WorkflowReport<{
    crawl?: Awaited<ReturnType<typeof crawlDiff>>
    index?: Awaited<ReturnType<typeof indexWatch>>
    recovery?: Awaited<ReturnType<typeof linkRecover>>
  }>
> {
  const recoverLinks = input.recoverLinks ?? true
  if (!input.startUrl && !input.urls?.length && !recoverLinks) {
    throw new Error(
      'Pass startUrl, urls, or enable link recovery for technical-watch.',
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
    input.urls?.length
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

  const alertCount =
    (crawl?.summary.newErrors ?? 0) +
    (crawl?.summary.indexabilityFlips ?? 0) +
    (index?.summary.alerts ?? 0) +
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
    summary: `${alertCount} material technical alert(s) found.`,
    steps: [
      {
        tool: 'seo_crawl_diff',
        status: crawl ? 'completed' : 'skipped',
        summary: crawl
          ? `Crawled ${crawl.summary.crawled} URLs; ${crawl.summary.changed} changed.`
          : 'No start URL passed.',
      },
      {
        tool: 'seo_index_watch',
        status: index ? 'completed' : 'skipped',
        summary: index
          ? `Inspected ${index.summary.inspected} URLs; ${index.summary.alerts} alerts.`
          : 'No inspection URLs passed.',
      },
      {
        tool: 'seo_link_recover',
        status: recovery ? 'completed' : 'skipped',
        summary: recovery
          ? `Checked ${recovery.summary.checked} search-value URLs; ${recovery.summary.recoverable} recoverable issue(s), ${recovery.summary.high} high severity.`
          : 'Link recovery disabled.',
      },
    ],
    actions,
    output: { crawl, index, recovery },
  })
}
